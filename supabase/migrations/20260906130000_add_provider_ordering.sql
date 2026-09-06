-- ============================================================
-- Provider-driven employee ordering (Batch 2)
-- ============================================================

-- Global order cutoff (Jamaica local time, applied on order day)
create table public.app_settings (
  id smallint primary key default 1
    check (id = 1),
  order_cutoff_time time not null default '16:00:00',
  updated_at timestamptz not null default now()
);

insert into public.app_settings default values;

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function private.set_updated_at();

-- Bridge provider menus to date-specific lunch days
alter table public.lunch_days
  drop constraint if exists lunch_days_lunch_date_key;

alter table public.lunch_days
  add column provider_id uuid
    references public.lunch_providers(id) on delete restrict,
  add column order_date date;

create unique index lunch_days_legacy_date_unique
  on public.lunch_days (lunch_date)
  where provider_id is null;

create unique index lunch_days_provider_delivery_unique
  on public.lunch_days (lunch_date, provider_id)
  where provider_id is not null;

alter table public.menu_items
  add column provider_menu_item_id uuid
    references public.provider_menu_items(id) on delete restrict;

create unique index menu_items_lunch_day_provider_item_unique
  on public.menu_items (lunch_day_id, provider_menu_item_id)
  where provider_menu_item_id is not null;

-- ============================================================
-- Date helpers (Jamaica business week)
-- ============================================================

create or replace function public.iso_weekday(p_date date)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when extract(isodow from p_date)::int between 1 and 5
      then extract(isodow from p_date)::int
    else null
  end;
$$;

create or replace function public.delivery_date_for_order_date(p_order_date date)
returns date
language sql
immutable
strict
set search_path = ''
as $$
  select case extract(isodow from p_order_date)::int
    when 1 then p_order_date + 1
    when 2 then p_order_date + 2
    when 3 then p_order_date + 3
    when 4 then p_order_date + 4
    when 5 then p_order_date + 3
    else null
  end;
$$;

create or replace function public.order_deadline_for_order_date(p_order_date date)
returns timestamptz
language sql
stable
strict
set search_path = ''
as $$
  select (
    p_order_date + s.order_cutoff_time
  ) at time zone 'America/Jamaica'
  from public.app_settings s
  where s.id = 1;
$$;

revoke all on function public.iso_weekday(date) from public;
grant execute on function public.iso_weekday(date) to authenticated;

revoke all on function public.delivery_date_for_order_date(date) from public;
grant execute on function public.delivery_date_for_order_date(date) to authenticated;

revoke all on function public.order_deadline_for_order_date(date) from public;
grant execute on function public.order_deadline_for_order_date(date) to authenticated;

-- Provider cycles follow the current HR cutoff via order_date.
-- Legacy manual lunch days keep their explicit lunch_days.order_deadline.
create or replace function public.effective_order_deadline(p_lunch_day_id uuid)
returns timestamptz
language sql
stable
strict
set search_path = ''
as $$
  select case
    when ld.provider_id is not null and ld.order_date is not null then
      public.order_deadline_for_order_date(ld.order_date)
    else
      ld.order_deadline
  end
  from public.lunch_days ld
  where ld.id = p_lunch_day_id;
$$;

revoke all on function public.effective_order_deadline(uuid) from public;
grant execute on function public.effective_order_deadline(uuid) to authenticated;

-- ============================================================
-- Remove per-user order cardinality restrictions (Batch 2)
-- ============================================================

drop index if exists public.one_active_order_per_user_per_lunch_day;

create or replace function private.validate_provider_order_mutable(p_lunch_day_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.lunch_days ld
    join public.lunch_providers lp on lp.id = ld.provider_id
    where ld.id = p_lunch_day_id
      and ld.provider_id is not null
      and lp.active = false
  ) then
    raise exception 'This provider is no longer active';
  end if;
end;
$$;

-- ============================================================
-- Snapshot provisioning
-- ============================================================

create or replace function private.ensure_provider_lunch_day(
  p_provider_id uuid,
  p_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_date date;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
begin
  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  v_delivery_date := public.delivery_date_for_order_date(p_order_date);

  if v_delivery_date is null then
    raise exception 'Unable to determine delivery date';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where lunch_date = v_delivery_date
    and provider_id = p_provider_id;

  if found then
    return v_lunch_day_id;
  end if;

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  insert into public.lunch_days (
    lunch_date,
    order_date,
    provider_id,
    order_deadline,
    status
  )
  values (
    v_delivery_date,
    p_order_date,
    p_provider_id,
    v_deadline,
    'open'
  )
  returning id into v_lunch_day_id;

  insert into public.menu_items (
    lunch_day_id,
    provider_menu_item_id,
    name,
    description,
    price,
    is_active
  )
  select
    v_lunch_day_id,
    pmi.id,
    pmi.name,
    pmi.description,
    pmi.price,
    true
  from public.provider_menu_items pmi
  join public.provider_menu_item_weekdays pmw
    on pmw.provider_menu_item_id = pmi.id
  where pmi.provider_id = p_provider_id
    and pmi.active = true
    and pmw.weekday = v_order_weekday;

  return v_lunch_day_id;
end;
$$;

-- ============================================================
-- Provider order submission
-- ============================================================

create or replace function public.submit_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
  v_order_id uuid;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  v_lunch_day_id := private.ensure_provider_lunch_day(
    p_provider_id,
    p_order_date
  );

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_provider_menu_item_id :=
        (v_item ->> 'provider_menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    if not exists (
      select 1
      from public.provider_menu_items pmi
      where pmi.id = v_provider_menu_item_id
        and pmi.provider_id = p_provider_id
        and pmi.active = true
    ) then
      raise exception 'Menu item is invalid or inactive';
    end if;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id
      and mi.is_active = true;

    if not found then
      raise exception 'Menu item is invalid or inactive';
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id
  )
  values (
    (select auth.uid()),
    v_lunch_day_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_provider_menu_item_id :=
      (v_item ->> 'provider_menu_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

revoke execute
on function public.submit_provider_order(uuid, date, jsonb)
from public, anon;

grant execute
on function public.submit_provider_order(uuid, date, jsonb)
to authenticated;

-- Use dynamic deadlines for provider cycles; legacy days keep stored values.
create or replace function private.validate_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_deadline timestamptz;
begin
  select ld.status, public.effective_order_deadline(ld.id)
  into v_status, v_deadline
  from public.lunch_days ld
  where ld.id = new.lunch_day_id;

  if not found then
    raise exception 'Lunch day does not exist';
  end if;

  if v_status <> 'open' then
    raise exception 'Ordering is not open for this lunch day';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  return new;
end;
$$;

create or replace function private.prepare_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lunch_day_id uuid;
  v_order_status text;
  v_menu_price numeric(10,2);
  v_day_status text;
  v_deadline timestamptz;
begin
  select lunch_day_id, status
  into v_lunch_day_id, v_order_status
  from public.orders
  where id = new.order_id;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Items cannot be added to this order';
  end if;

  select price
  into v_menu_price
  from public.menu_items
  where id = new.menu_item_id
    and lunch_day_id = v_lunch_day_id
    and is_active = true;

  if not found then
    raise exception 'Menu item is invalid or inactive';
  end if;

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  new.lunch_day_id := v_lunch_day_id;
  new.unit_price := v_menu_price;

  return new;
end;
$$;

-- Extend cancel/replace to block edits when provider is inactive
create or replace function public.cancel_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> (select auth.uid()) then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be cancelled';
  end if;

  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id;
end;
$$;

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> (select auth.uid()) then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be edited';
  end if;

  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;
end;
$$;

-- ============================================================
-- Row Level Security for app_settings
-- ============================================================

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon;
grant select, update on public.app_settings to authenticated;

create policy "Authenticated users can view app settings"
on public.app_settings
for select
to authenticated
using (true);

create policy "Admins can update app settings"
on public.app_settings
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
