-- Staff multi-provider checkout: group related provider orders from one Place Order action.

alter table public.orders
  add column if not exists order_group_id uuid;

create index if not exists orders_order_group_id_idx
  on public.orders (order_group_id)
  where order_group_id is not null;

comment on column public.orders.order_group_id is
  'Links provider orders submitted together in one staff checkout. Null for legacy or single RPC submits.';

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
  if (select auth.uid()) is null then
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
      raise exception 'Menu item is invalid or inactive';
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
    (select auth.uid()),
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

create or replace function public.submit_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.insert_provider_order(
    p_provider_id,
    p_order_date,
    p_items,
    p_special_instructions,
    p_office_location_id,
    null
  );
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
  v_order_group_id uuid := gen_random_uuid();
  v_entry jsonb;
  v_provider_id uuid;
  v_items jsonb;
  v_special_instructions text;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_seen_providers uuid[] := '{}';
begin
  if (select auth.uid()) is null then
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

    if v_provider_id = any (v_seen_providers) then
      raise exception 'Duplicate provider in checkout';
    end if;

    v_seen_providers := array_append(v_seen_providers, v_provider_id);

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

revoke execute on function public.submit_provider_checkout(date, uuid, jsonb)
from public, anon;

grant execute on function public.submit_provider_checkout(date, uuid, jsonb)
to authenticated;
