-- Align create_hr_late_order with fetch_hr_late_order_snapshot_menu for empty current-day lunch days.

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
  v_jamaica_today date := private.jamaica_today_date();
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

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(
    p_provider_id,
    v_order_date
  );

  if v_lunch_day_id is null then
    if v_order_date < v_jamaica_today then
      raise exception 'The menu snapshot for this provider and order date is unavailable.';
    elsif v_order_date = v_jamaica_today then
      v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
    else
      raise exception 'The menu snapshot for this provider and order date is unavailable.';
    end if;
  elsif v_order_date = v_jamaica_today then
    v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
  end if;

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
