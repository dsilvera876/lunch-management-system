-- HR-fulfilled late orders must participate in Staff My Orders checkout grouping.

create or replace function private.create_hr_late_order_core(
  p_actor uuid,
  p_profile_id uuid,
  p_provider_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_lunch_day_id uuid;
  v_jamaica_today date := private.jamaica_today_date();
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_order_id uuid;
  v_order_group_id uuid := gen_random_uuid();
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_employee_location_id uuid;
  v_special_instructions text;
begin
  if not exists (
    select 1 from public.profiles pr where pr.id = p_profile_id
  ) then
    raise exception 'Employee not found';
  end if;

  select p.default_office_location_id
  into v_employee_location_id
  from public.profiles p
  where p.id = p_profile_id;

  perform private.assert_staff_late_order_request_window(
    p_profile_id,
    p_provider_id,
    p_delivery_date,
    now()
  );

  v_order_date := public.order_date_for_delivery_date(p_delivery_date, v_employee_location_id);

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(p_provider_id, v_order_date);

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

  v_special_instructions := private.normalize_special_instructions(p_special_instructions);

  if length(trim(coalesce(p_special_instructions, ''))) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.activate_bypass_order_deadline();

  insert into public.orders (
    profile_id, lunch_day_id, meal_quantity,
    office_location_id, office_location_name, office_location_address,
    special_instructions, is_late_order,
    late_order_created_by, late_order_approved_at, late_order_approved_by,
    order_group_id
  )
  values (
    p_profile_id, v_lunch_day_id, v_meal_quantity,
    v_location_id, v_location_name, v_location_address,
    v_special_instructions, true,
    p_actor, now(), p_actor,
    v_order_group_id
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity)
    values (v_order_id, v_menu_item_id, v_lunch_day_id, v_quantity);
  end loop;

  perform private.safe_notify_staff_order_event('staff.changed_by_hr', v_order_id);
  return v_order_id;
end;
$$;

revoke all on function private.create_hr_late_order_core(uuid, uuid, uuid, date, jsonb, text, uuid) from public;

update public.orders
set order_group_id = gen_random_uuid()
where is_late_order = true
  and order_group_id is null;
