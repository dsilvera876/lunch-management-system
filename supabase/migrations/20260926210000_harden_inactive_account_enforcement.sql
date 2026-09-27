-- ============================================================
-- Inactive account enforcement: account_status gate + auth.uid fixes
-- ============================================================

-- ------------------------------------------------------------
-- Trusted account_status change gate (mirrors role_change_gate)
-- ------------------------------------------------------------

create table if not exists private.account_status_change_gate (
  id int primary key default 1 check (id = 1),
  gate_secret text not null default encode(extensions.gen_random_bytes(32), 'hex')
);

insert into private.account_status_change_gate (id, gate_secret)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

revoke all on table private.account_status_change_gate from public, anon, authenticated;

create or replace function private.trusted_account_status_change_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.account_status_change_gate', true), ''),
    ''
  ) = (
    select gate_secret
    from private.account_status_change_gate
    where id = 1
  );
$$;

revoke all on function private.trusted_account_status_change_active() from public, anon, authenticated;

create or replace function private.activate_trusted_account_status_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config(
    'app.account_status_change_gate',
    (select gate_secret from private.account_status_change_gate where id = 1),
    true
  );
end;
$$;

revoke all on function private.activate_trusted_account_status_change() from public, anon, authenticated;

create or replace function private.deactivate_trusted_account_status_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.account_status_change_gate', '', true);
end;
$$;

revoke all on function private.deactivate_trusted_account_status_change() from public, anon, authenticated;

create or replace function private.guard_profile_account_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.account_status is distinct from old.account_status then
    if not (select private.trusted_account_status_change_active()) then
      raise exception
        'Account status changes must use HR staff account management';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_account_status_change on public.profiles;

create trigger guard_profile_account_status_change
  before update on public.profiles
  for each row
  execute function private.guard_profile_account_status_change();

-- ------------------------------------------------------------
-- HR status RPC must use the trusted gate
-- ------------------------------------------------------------

create or replace function public.set_staff_active_status(
  p_profile_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_target_role text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_staff_accounts()) then
    raise exception 'Staff account management access required';
  end if;

  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'Invalid account status';
  end if;

  select p.role
  into v_target_role
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    raise exception 'Profile does not exist';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner accounts cannot be deactivated through this workflow';
  end if;

  if p_profile_id = v_actor and p_status = 'inactive' then
    raise exception 'You cannot deactivate your own account';
  end if;

  perform private.activate_trusted_account_status_change();

  update public.profiles
  set account_status = p_status
  where id = p_profile_id;

  perform private.deactivate_trusted_account_status_change();
end;
$$;

revoke execute on function public.set_staff_active_status(uuid, text) from public, anon;
grant execute on function public.set_staff_active_status(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Profile RLS: only active application users may self-read/update
-- ------------------------------------------------------------

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using ((select private.current_user_id()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select private.current_user_id()) = id)
with check ((select private.current_user_id()) = id);

-- ------------------------------------------------------------
-- Staff order/profile RPCs: honor inactive via current_user_id()
-- ------------------------------------------------------------

create or replace function public.set_my_default_office_location(
  p_office_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_office_location_id is not null then
    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = p_office_location_id
        and ol.is_active = true
    ) then
      raise exception 'Office location is invalid or inactive';
    end if;
  end if;

  perform private.activate_trusted_profile_default_location();

  update public.profiles
  set default_office_location_id = p_office_location_id
  where id = v_actor;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
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

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be cancelled';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);
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

create or replace function public.submit_provider_checkout(
  p_order_date date,
  p_office_location_id uuid,
  p_provider_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_group_id uuid := gen_random_uuid();
  v_entry jsonb;
  v_provider_id uuid;
  v_items jsonb;
  v_special_instructions text;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_provider_orders) <> 'array' then
    raise exception 'Invalid checkout payload';
  end if;

  if jsonb_array_length(p_provider_orders) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_provider_orders)
  loop
    begin
      v_provider_id := (v_entry ->> 'provider_id')::uuid;
    exception
      when others then
        raise exception 'Invalid checkout payload';
    end;

    v_items := v_entry -> 'items';

    if jsonb_typeof(v_items) <> 'object' then
      raise exception 'Invalid checkout payload';
    end if;

    v_special_instructions := v_entry ->> 'special_instructions';

    v_order_id := private.insert_provider_order(
      v_provider_id,
      p_order_date,
      v_items,
      v_special_instructions,
      p_office_location_id,
      v_order_group_id
    );

    v_order_ids := array_append(v_order_ids, v_order_id);
  end loop;

  return jsonb_build_object(
    'order_group_id',
    v_order_group_id,
    'order_ids',
    to_jsonb(v_order_ids)
  );
end;
$$;

-- private.insert_provider_order: replace auth.uid() with active current_user_id()
create or replace function private.insert_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid,
  p_order_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  v_meal_quantity := private.validate_provider_order_payload(
    p_provider_id,
    p_items
  );

  v_items := private.build_provider_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  v_special_instructions :=
    private.normalize_special_instructions(p_special_instructions);

  if p_special_instructions is not null
     and length(trim(p_special_instructions)) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.validate_order_date_not_in_finalized_period(p_order_date);

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
    from jsonb_array_elements(v_items)
  loop
    begin
      v_provider_menu_item_id :=
        (v_item ->> 'provider_menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id
      and mi.is_active = true;

    if not found then
      raise exception
        'Menu item % for provider % is invalid or inactive on lunch day %',
        v_provider_menu_item_id,
        p_provider_id,
        v_lunch_day_id;
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    special_instructions,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address,
    order_group_id
  )
  values (
    v_actor,
    v_lunch_day_id,
    v_special_instructions,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address,
    p_order_group_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
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

revoke execute on function private.insert_provider_order(uuid, date, jsonb, text, uuid, uuid)
from public, anon, authenticated;

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_update_instructions boolean := p_special_instructions is not null;
  v_current_location_id uuid;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
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

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be edited';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);
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

  v_meal_quantity := private.validate_snapshot_order_payload(
    v_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if v_update_instructions then
    v_special_instructions :=
      private.normalize_special_instructions(p_special_instructions);

    if length(trim(coalesce(p_special_instructions, ''))) > 0
       and v_special_instructions is null then
      raise exception 'Special instructions are too long';
    end if;
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  select office_location_id
  into v_current_location_id
  from public.orders
  where id = p_order_id;

  if p_office_location_id is not null
     and p_office_location_id is distinct from v_current_location_id then
    select *
    into v_location_id, v_location_name, v_location_address
    from private.resolve_active_office_location_snapshot(p_office_location_id);

    update public.orders
    set
      meal_quantity = v_meal_quantity,
      office_location_id = v_location_id,
      office_location_name = v_location_name,
      office_location_address = v_location_address
    where id = p_order_id;
  else
    update public.orders
    set meal_quantity = v_meal_quantity
    where id = p_order_id;
  end if;

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
      p_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;

  if v_update_instructions then
    update public.orders
    set special_instructions = v_special_instructions
    where id = p_order_id;
  end if;
end;
$$;

create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  v_meal_quantity := private.validate_snapshot_order_payload(
    p_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address
  )
  values (
    v_actor,
    p_lunch_day_id,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address
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
