-- Richer menu-item validation errors for server logs and support (UI may stay concise).

create or replace function private.validate_provider_order_payload(
  p_provider_id uuid,
  p_order jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_main_id uuid;
  v_side_ids uuid[] := '{}';
  v_meal_quantity integer;
  v_standalone_items jsonb;
  v_side_id uuid;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_quantity integer;
  v_item_type text;
  v_seen_ids uuid[] := '{}';
  v_side_count integer := 0;
  v_standalone_count integer := 0;
begin
  if jsonb_typeof(p_order) <> 'object' then
    raise exception 'Invalid order payload';
  end if;

  begin
    v_main_id := nullif(p_order ->> 'main_provider_menu_item_id', '')::uuid;
  exception
    when others then
      raise exception 'Invalid order payload';
  end;

  v_standalone_items := coalesce(p_order -> 'standalone_items', '[]'::jsonb);

  if jsonb_typeof(v_standalone_items) <> 'array' then
    raise exception 'Invalid order payload';
  end if;

  begin
    if p_order ->> 'meal_quantity' is null
       or length(trim(p_order ->> 'meal_quantity')) = 0 then
      v_meal_quantity := null;
    else
      v_meal_quantity := (p_order ->> 'meal_quantity')::integer;
    end if;
  exception
    when others then
      raise exception 'Meal quantity must be a positive integer';
  end;

  if p_order ? 'side_provider_menu_item_ids' then
    if jsonb_typeof(p_order -> 'side_provider_menu_item_ids') <> 'array' then
      raise exception 'Invalid order payload';
    end if;

    for v_side_id in
      select value::uuid
      from jsonb_array_elements_text(p_order -> 'side_provider_menu_item_ids')
    loop
      v_side_ids := array_append(v_side_ids, v_side_id);
    end loop;
  end if;

  v_side_count := coalesce(array_length(v_side_ids, 1), 0);

  for v_item in
    select value
    from jsonb_array_elements(v_standalone_items)
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

    if v_provider_menu_item_id = any (v_seen_ids) then
      raise exception 'Duplicate menu items are not allowed in one order';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_provider_menu_item_id);

    select pmi.item_type
    into v_item_type
    from public.provider_menu_items pmi
    where pmi.id = v_provider_menu_item_id
      and pmi.provider_id = p_provider_id
      and pmi.active = true;

    if not found then
      raise exception 'Menu item % for provider % is invalid or inactive',
        v_provider_menu_item_id,
        p_provider_id;
    end if;

    if v_item_type <> 'standalone' then
      raise exception 'Menu item has an invalid type';
    end if;

    v_standalone_count := v_standalone_count + 1;
  end loop;

  if v_main_id is not null
     or v_side_count > 0
     or v_meal_quantity is not null then
    if v_main_id is null then
      raise exception 'Side items require a main item';
    end if;

    if v_side_count = 0 then
      raise exception 'A main item requires at least one side item';
    end if;

    if v_meal_quantity is null or v_meal_quantity <= 0 then
      raise exception 'Meal quantity must be greater than zero';
    end if;

    if v_main_id = any (v_seen_ids) then
      raise exception 'Duplicate menu items are not allowed in one order';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_main_id);

    select pmi.item_type
    into v_item_type
    from public.provider_menu_items pmi
    where pmi.id = v_main_id
      and pmi.provider_id = p_provider_id
      and pmi.active = true;

    if not found then
      raise exception 'Menu item % for provider % is invalid or inactive',
        v_main_id,
        p_provider_id;
    end if;

    if v_item_type <> 'main' then
      raise exception 'Menu item has an invalid type';
    end if;

    foreach v_side_id in array v_side_ids
    loop
      if v_side_id = any (v_seen_ids) then
        raise exception 'Duplicate menu items are not allowed in one order';
      end if;

      v_seen_ids := array_append(v_seen_ids, v_side_id);

      select pmi.item_type
      into v_item_type
      from public.provider_menu_items pmi
      where pmi.id = v_side_id
        and pmi.provider_id = p_provider_id
        and pmi.active = true;

      if not found then
        raise exception 'Menu item % for provider % is invalid or inactive',
          v_side_id,
          p_provider_id;
      end if;

      if v_item_type <> 'side' then
        raise exception 'Menu item has an invalid type';
      end if;
    end loop;

    perform private.validate_order_composition_counts(
      1,
      v_side_count,
      v_standalone_count
    );

    return v_meal_quantity;
  end if;

  if v_meal_quantity is not null then
    raise exception 'Standalone-only orders cannot include meal quantity';
  end if;

  perform private.validate_order_composition_counts(
    0,
    0,
    v_standalone_count
  );

  return null;
end;
$$;

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

revoke execute on function private.insert_provider_order(uuid, date, jsonb, text, uuid, uuid)
from public, anon, authenticated;
