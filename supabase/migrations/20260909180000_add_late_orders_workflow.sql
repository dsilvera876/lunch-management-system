-- ============================================================
-- HR late orders: provider settings, dispatch audit, RPCs
-- ============================================================

-- ------------------------------------------------------------
-- Provider late-order + email settings
-- ------------------------------------------------------------

alter table public.lunch_providers
add column accepts_late_orders boolean not null default false,
add column late_order_deadline_day text
  check (late_order_deadline_day is null or late_order_deadline_day in ('order_day', 'delivery_day')),
add column late_order_deadline_time time,
add column supplemental_dispatch_mode text not null default 'manual'
  check (supplemental_dispatch_mode in ('manual', 'automatic')),
add column automatic_supplement_send_day text
  check (automatic_supplement_send_day is null or automatic_supplement_send_day in ('order_day', 'delivery_day')),
add column automatic_supplement_send_time time,
add column primary_order_email text;

alter table public.lunch_providers
add constraint lunch_providers_late_settings_required
check (
  accepts_late_orders = false
  or (
    late_order_deadline_day is not null
    and late_order_deadline_time is not null
  )
);

alter table public.lunch_providers
add constraint lunch_providers_automatic_supplement_required
check (
  supplemental_dispatch_mode = 'manual'
  or (
    automatic_supplement_send_day is not null
    and automatic_supplement_send_time is not null
  )
);

create or replace function private.validate_provider_late_order_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_date date;
  v_delivery_date date;
  v_deadline timestamptz;
  v_send_at timestamptz;
begin
  if new.primary_order_email is not null
     and new.primary_order_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid provider order email';
  end if;

  if new.supplemental_dispatch_mode = 'automatic'
     and new.accepts_late_orders = true
     and new.automatic_supplement_send_day is not null
     and new.automatic_supplement_send_time is not null
     and new.late_order_deadline_day is not null
     and new.late_order_deadline_time is not null then
    v_order_date := current_date;
    v_delivery_date := public.delivery_date_for_order_date(v_order_date);

    if v_delivery_date is not null then
      v_send_at := public.provider_late_order_anchor_at(
        new.automatic_supplement_send_day,
        new.automatic_supplement_send_time,
        v_order_date,
        v_delivery_date
      );
      v_deadline := public.provider_late_order_anchor_at(
        new.late_order_deadline_day,
        new.late_order_deadline_time,
        v_order_date,
        v_delivery_date
      );

      if v_send_at > v_deadline then
        raise exception 'Automatic supplement send time must be on or before the late-order deadline';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_provider_late_order_settings
on public.lunch_providers;

create trigger validate_provider_late_order_settings
before insert or update on public.lunch_providers
for each row
execute function private.validate_provider_late_order_settings();

-- ------------------------------------------------------------
-- Order late-order metadata
-- ------------------------------------------------------------

alter table public.orders
add column is_late_order boolean not null default false,
add column late_order_created_by uuid references public.profiles (id),
add column late_order_approved_at timestamptz,
add column late_order_approved_by uuid references public.profiles (id);

alter table public.orders
add constraint orders_late_order_metadata_consistency
check (
  is_late_order = false
  or (
    late_order_created_by is not null
    and late_order_approved_at is not null
    and late_order_approved_by is not null
  )
);

-- ------------------------------------------------------------
-- Supplemental dispatch audit
-- ------------------------------------------------------------

create table public.provider_late_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.lunch_providers (id) on delete restrict,
  scheduled_delivery_date date not null,
  dispatch_type text not null check (dispatch_type in ('manual', 'automatic')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  provider_email text,
  error_summary text,
  message_metadata jsonb
);

create table public.provider_late_order_dispatch_orders (
  dispatch_id uuid not null
    references public.provider_late_order_dispatches (id) on delete cascade,
  order_id uuid not null
    references public.orders (id) on delete restrict,
  primary key (dispatch_id, order_id)
);

create unique index provider_late_order_dispatch_orders_order_once_idx
on public.provider_late_order_dispatch_orders (order_id);

create index provider_late_order_dispatches_lookup_idx
on public.provider_late_order_dispatches (provider_id, scheduled_delivery_date, created_at desc);

alter table public.provider_late_order_dispatches enable row level security;
alter table public.provider_late_order_dispatch_orders enable row level security;

create policy "HR can view late order dispatches"
on public.provider_late_order_dispatches
for select
to authenticated
using ((select private.can_view_all_orders()));

create policy "HR can view late order dispatch membership"
on public.provider_late_order_dispatch_orders
for select
to authenticated
using ((select private.can_view_all_orders()));

revoke insert, update, delete on public.provider_late_order_dispatches from authenticated;
revoke insert, update, delete on public.provider_late_order_dispatch_orders from authenticated;

-- ------------------------------------------------------------
-- Date helpers
-- ------------------------------------------------------------

create or replace function public.order_date_for_delivery_date(p_delivery_date date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_offset integer;
  v_candidate date;
begin
  if extract(isodow from p_delivery_date)::int not between 1 and 7 then
    return null;
  end if;

  foreach v_offset in array array[1, 2, 3, 4, 5]
  loop
    v_candidate := (p_delivery_date - v_offset)::date;

    if public.delivery_date_for_order_date(v_candidate) = p_delivery_date then
      return v_candidate;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.order_date_for_delivery_date(date) from public;
grant execute on function public.order_date_for_delivery_date(date) to authenticated;

create or replace function public.provider_late_order_anchor_at(
  p_anchor_day text,
  p_anchor_time time,
  p_order_date date,
  p_delivery_date date
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_anchor_date date;
begin
  if p_anchor_day = 'order_day' then
    v_anchor_date := p_order_date;
  elsif p_anchor_day = 'delivery_day' then
    v_anchor_date := p_delivery_date;
  else
    return null;
  end if;

  return (v_anchor_date + p_anchor_time) at time zone 'America/Jamaica';
end;
$$;

revoke all on function public.provider_late_order_anchor_at(text, time, date, date) from public;
grant execute on function public.provider_late_order_anchor_at(text, time, date, date) to authenticated;

create or replace function public.provider_late_order_deadline_at(
  p_provider_id uuid,
  p_order_date date,
  p_delivery_date date
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select public.provider_late_order_anchor_at(
    lp.late_order_deadline_day,
    lp.late_order_deadline_time,
    p_order_date,
    p_delivery_date
  )
  from public.lunch_providers lp
  where lp.id = p_provider_id;
$$;

revoke all on function public.provider_late_order_deadline_at(uuid, date, date) from public;
grant execute on function public.provider_late_order_deadline_at(uuid, date, date) to authenticated;

create or replace function public.provider_automatic_supplement_send_at(
  p_provider_id uuid,
  p_order_date date,
  p_delivery_date date
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select public.provider_late_order_anchor_at(
    lp.automatic_supplement_send_day,
    lp.automatic_supplement_send_time,
    p_order_date,
    p_delivery_date
  )
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.supplemental_dispatch_mode = 'automatic';
$$;

revoke all on function public.provider_automatic_supplement_send_at(uuid, date, date) from public;
grant execute on function public.provider_automatic_supplement_send_at(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- Deadline bypass for trusted HR late-order creation
-- ------------------------------------------------------------

create or replace function private.bypass_order_deadline_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.bypass_order_deadline', true), ''),
    'false'
  ) = 'true';
$$;

revoke all on function private.bypass_order_deadline_active() from public, anon, authenticated;

create or replace function private.activate_bypass_order_deadline()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.bypass_order_deadline', 'true', true);
end;
$$;

revoke all on function private.activate_bypass_order_deadline() from public, anon, authenticated;

create or replace function private.validate_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_deadline timestamptz;
  v_order_date date;
begin
  select
    ld.status,
    public.effective_order_deadline(ld.id),
    coalesce(ld.order_date, ld.lunch_date)
  into v_status, v_deadline, v_order_date
  from public.lunch_days ld
  where ld.id = new.lunch_day_id;

  if not found then
    raise exception 'Lunch day does not exist';
  end if;

  perform private.validate_order_date_not_in_finalized_period(v_order_date);

  if v_status <> 'open' then
    raise exception 'Ordering is not open for this lunch day';
  end if;

  if not (select private.bypass_order_deadline_active())
     and now() > v_deadline then
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

  if not (select private.bypass_order_deadline_active())
     and now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  new.lunch_day_id := v_lunch_day_id;
  new.unit_price := v_menu_price;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- HR office location resolution (explicit location for employee)
-- ------------------------------------------------------------

create or replace function private.resolve_hr_order_office_location_snapshot(
  p_office_location_id uuid,
  out o_location_id uuid,
  out o_location_name text,
  out o_location_address text
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_office_location_id is null then
    raise exception 'Delivery location is required';
  end if;

  select ol.id, ol.name, ol.address
  into o_location_id, o_location_name, o_location_address
  from public.office_locations ol
  where ol.id = p_office_location_id
    and ol.is_active = true;

  if not found then
    raise exception 'Delivery location is invalid or inactive';
  end if;
end;
$$;

revoke all on function private.resolve_hr_order_office_location_snapshot(uuid)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Proactive snapshot materialization (cutoff + late-order safety)
-- ------------------------------------------------------------

create or replace function public.materialize_provider_snapshots_for_order_date(
  p_order_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider record;
  v_count integer := 0;
begin
  if public.iso_weekday(p_order_date) is null then
    return 0;
  end if;

  for v_provider in
    select id
    from public.lunch_providers
    where active = true
  loop
    perform private.ensure_provider_lunch_day(v_provider.id, p_order_date);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.materialize_provider_snapshots_for_order_date(date)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Late-order dispatch helpers
-- ------------------------------------------------------------

create or replace function private.late_order_is_dispatched(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_late_order_dispatch_orders pldo
    join public.provider_late_order_dispatches pld
      on pld.id = pldo.dispatch_id
    where pldo.order_id = p_order_id
      and pld.status = 'sent'
  );
$$;

revoke all on function private.late_order_is_dispatched(uuid)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Create HR late order
-- ------------------------------------------------------------

create or replace function public.create_hr_late_order(
  p_profile_id uuid,
  p_provider_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_date date;
  v_lunch_day_id uuid;
  v_company_deadline timestamptz;
  v_provider_deadline timestamptz;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_order_id uuid;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_special_instructions text;
  v_accepts boolean;
begin
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  if not exists (
    select 1
    from public.profiles pr
    where pr.id = p_profile_id
  ) then
    raise exception 'Employee not found';
  end if;

  select lp.accepts_late_orders
  into v_accepts
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not coalesce(v_accepts, false) then
    raise exception 'Provider does not accept late orders';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_delivery_date);

  if v_order_date is null then
    raise exception 'Invalid delivery date';
  end if;

  if public.delivery_date_for_order_date(v_order_date) <> p_delivery_date then
    raise exception 'Delivery date does not match order cycle';
  end if;

  perform private.validate_order_date_not_in_finalized_period(v_order_date);

  v_company_deadline := public.order_deadline_for_order_date(v_order_date);

  if now() <= v_company_deadline then
    raise exception 'Normal ordering is still open; use standard ordering';
  end if;

  v_provider_deadline := public.provider_late_order_deadline_at(
    p_provider_id,
    v_order_date,
    p_delivery_date
  );

  if v_provider_deadline is null then
    raise exception 'Provider late-order deadline is not configured';
  end if;

  if now() > v_provider_deadline then
    raise exception 'Provider late-order deadline has passed';
  end if;

  v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);

  v_meal_quantity := private.validate_snapshot_order_payload(v_lunch_day_id, p_items);
  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_hr_order_office_location_snapshot(p_office_location_id);

  v_special_instructions :=
    private.normalize_special_instructions(p_special_instructions);

  if length(trim(coalesce(p_special_instructions, ''))) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.activate_bypass_order_deadline();

  insert into public.orders (
    profile_id,
    lunch_day_id,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address,
    special_instructions,
    is_late_order,
    late_order_created_by,
    late_order_approved_at,
    late_order_approved_by
  )
  values (
    p_profile_id,
    v_lunch_day_id,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address,
    v_special_instructions,
    true,
    v_actor,
    now(),
    v_actor
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
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
      lunch_day_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

revoke execute on function public.create_hr_late_order(uuid, uuid, date, jsonb, text, uuid)
from public, anon;

grant execute on function public.create_hr_late_order(uuid, uuid, date, jsonb, text, uuid)
to authenticated;

-- ------------------------------------------------------------
-- Supplemental dispatch: claim + finalize (email from app layer)
-- ------------------------------------------------------------

create or replace function public.claim_provider_late_order_supplement(
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_dispatch_id uuid;
  v_provider_email text;
  v_order_ids uuid[];
begin
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_provider_id::text || ':' || p_scheduled_delivery_date::text, 0)
  );

  if exists (
    select 1
    from public.provider_late_order_dispatches pld
    where pld.provider_id = p_provider_id
      and pld.scheduled_delivery_date = p_scheduled_delivery_date
      and pld.status = 'pending'
  ) then
    raise exception 'Supplement dispatch already in progress';
  end if;

  select lp.primary_order_email
  into v_provider_email
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if v_provider_email is null or length(trim(v_provider_email)) = 0 then
    raise exception 'Provider order email is not configured';
  end if;

  select coalesce(array_agg(o.id order by o.created_at), '{}'::uuid[])
  into v_order_ids
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.is_late_order = true
    and ld.provider_id = p_provider_id
    and ld.lunch_date = p_scheduled_delivery_date
    and o.status = 'submitted'
    and not (select private.late_order_is_dispatched(o.id));

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    raise exception 'No approved unsent late orders for this provider and delivery date';
  end if;

  insert into public.provider_late_order_dispatches (
    provider_id,
    scheduled_delivery_date,
    dispatch_type,
    status,
    created_by,
    provider_email,
    message_metadata
  )
  values (
    p_provider_id,
    p_scheduled_delivery_date,
    'manual',
    'pending',
    v_actor,
    v_provider_email,
    jsonb_build_object('order_ids', to_jsonb(v_order_ids))
  )
  returning id into v_dispatch_id;

  return jsonb_build_object(
    'dispatch_id', v_dispatch_id,
    'provider_email', v_provider_email,
    'order_ids', to_jsonb(v_order_ids)
  );
end;
$$;

revoke execute on function public.claim_provider_late_order_supplement(uuid, date)
from public, anon;

grant execute on function public.claim_provider_late_order_supplement(uuid, date)
to authenticated;

create or replace function public.finalize_provider_late_order_supplement(
  p_dispatch_id uuid,
  p_success boolean,
  p_error_summary text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_dispatch record;
  v_order_id uuid;
  v_order_ids jsonb;
begin
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  select *
  into v_dispatch
  from public.provider_late_order_dispatches
  where id = p_dispatch_id
  for update;

  if not found then
    raise exception 'Dispatch not found';
  end if;

  if v_dispatch.status <> 'pending' then
    raise exception 'Dispatch is not pending';
  end if;

  v_order_ids := coalesce(v_dispatch.message_metadata -> 'order_ids', '[]'::jsonb);

  if p_success then
    for v_order_id in
      select value::uuid
      from jsonb_array_elements_text(v_order_ids)
    loop
      if not exists (
        select 1
        from public.orders o
        where o.id = v_order_id
          and o.is_late_order = true
          and o.status = 'submitted'
          and not (select private.late_order_is_dispatched(o.id))
      ) then
        raise exception 'Late order % is no longer eligible for dispatch', v_order_id;
      end if;

      insert into public.provider_late_order_dispatch_orders (
        dispatch_id,
        order_id
      )
      values (
        p_dispatch_id,
        v_order_id
      );
    end loop;

    update public.provider_late_order_dispatches
    set status = 'sent',
        sent_at = now(),
        error_summary = null
    where id = p_dispatch_id;
  else
    update public.provider_late_order_dispatches
    set status = 'failed',
        error_summary = left(coalesce(p_error_summary, 'Email send failed'), 500)
    where id = p_dispatch_id;
  end if;
end;
$$;

revoke execute on function public.finalize_provider_late_order_supplement(uuid, boolean, text)
from public, anon;

grant execute on function public.finalize_provider_late_order_supplement(uuid, boolean, text)
to authenticated;
