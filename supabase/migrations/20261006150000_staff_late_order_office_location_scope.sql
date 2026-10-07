-- Location-scoped staff late-order eligibility and submission.

create or replace function private.resolve_staff_late_order_office_location(
  p_profile_id uuid,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resolved uuid;
begin
  if p_office_location_id is not null then
    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = p_office_location_id
        and ol.is_active = true
    ) then
      raise exception 'Delivery location is invalid or inactive';
    end if;

    return p_office_location_id;
  end if;

  select p.default_office_location_id
  into v_resolved
  from public.profiles p
  where p.id = p_profile_id;

  if v_resolved is null then
    raise exception 'Delivery location is required';
  end if;

  if not exists (
    select 1
    from public.office_locations ol
    where ol.id = v_resolved
      and ol.is_active = true
  ) then
    raise exception 'Delivery location is invalid or inactive';
  end if;

  return v_resolved;
end;
$$;

revoke all on function private.resolve_staff_late_order_office_location(uuid, uuid) from public;

drop function if exists private.assert_staff_late_order_request_window(uuid, uuid, date, timestamptz);

create or replace function private.assert_staff_late_order_request_window(
  p_requester_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_as_of timestamptz default now(),
  p_office_location_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_location_id uuid;
  v_accepts boolean;
  v_provider_deadline timestamptz;
begin
  if not private.is_active_lunch_ordering_profile(p_requester_profile_id) then
    raise exception 'Lunch ordering is not available for this account';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_requester_profile_id
      and p.account_status = 'active'
  ) then
    raise exception 'Account is not active';
  end if;

  v_location_id := private.resolve_staff_late_order_office_location(
    p_requester_profile_id,
    p_office_location_id
  );

  select lp.accepts_late_orders
  into v_accepts
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not coalesce(v_accepts, false) then
    raise exception 'Provider does not accept late orders';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date, v_location_id);

  if v_order_date is null then
    raise exception 'Invalid delivery date';
  end if;

  if public.delivery_date_for_order_date(v_order_date, v_location_id) <> p_scheduled_delivery_date then
    raise exception 'Delivery date does not match order cycle';
  end if;

  perform private.validate_order_date_not_in_finalized_period(v_order_date);

  if not public.is_business_day(v_order_date, v_location_id) then
    raise exception 'Ordering is not available on this business day';
  end if;

  if public.is_before_order_deadline(v_order_date, p_as_of) then
    raise exception 'Normal ordering is still open; use standard ordering';
  end if;

  v_provider_deadline := public.provider_late_order_deadline_at(
    p_provider_id,
    v_order_date,
    p_scheduled_delivery_date
  );

  if v_provider_deadline is null then
    raise exception 'Provider late-order deadline is not configured';
  end if;

  if p_as_of > v_provider_deadline then
    raise exception 'Provider late-order deadline has passed';
  end if;
end;
$$;

revoke all on function private.assert_staff_late_order_request_window(uuid, uuid, date, timestamptz, uuid) from public;

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
  v_special_instructions text;
begin
  if not exists (
    select 1 from public.profiles pr where pr.id = p_profile_id
  ) then
    raise exception 'Employee not found';
  end if;

  perform private.assert_staff_late_order_request_window(
    p_profile_id,
    p_provider_id,
    p_delivery_date,
    now(),
    p_office_location_id
  );

  v_order_date := public.order_date_for_delivery_date(p_delivery_date, p_office_location_id);

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

drop function if exists public.create_staff_late_order_request(uuid, date, text, integer, text);

create or replace function public.create_staff_late_order_request(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_requested_summary text,
  p_quantity integer default 1,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_location_id uuid;
  v_order_date date;
  v_summary text := btrim(p_requested_summary);
  v_instructions text;
  v_request_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if v_summary is null or char_length(v_summary) = 0 or char_length(v_summary) > 500 then
    raise exception 'Request summary is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  v_instructions := nullif(btrim(coalesce(p_special_instructions, '')), '');
  if v_instructions is not null and char_length(v_instructions) > 500 then
    raise exception 'Special instructions are too long';
  end if;

  v_location_id := private.resolve_staff_late_order_office_location(v_actor, p_office_location_id);

  perform private.assert_staff_late_order_request_window(
    v_actor,
    p_provider_id,
    p_scheduled_delivery_date,
    now(),
    v_location_id
  );

  if private.profile_has_submitted_late_order(v_actor, p_provider_id, p_scheduled_delivery_date) then
    raise exception 'A late order already exists for this provider and delivery date';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date, v_location_id);

  insert into private.staff_late_order_requests (
    requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
    status, requested_summary, quantity, special_instructions
  )
  values (
    v_actor, p_provider_id, v_location_id, v_order_date, p_scheduled_delivery_date,
    'pending', v_summary, p_quantity, v_instructions
  )
  returning id into v_request_id;

  perform private.insert_staff_late_order_request_event(
    v_request_id, 'submitted', v_actor,
    jsonb_build_object('provider_id', p_provider_id, 'scheduled_delivery_date', p_scheduled_delivery_date)
  );

  perform private.safe_notify_hr_late_order_submitted(v_request_id);
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A pending request already exists for this provider and delivery date';
end;
$$;

revoke execute on function public.create_staff_late_order_request(uuid, date, text, integer, text, uuid) from public, anon;
grant execute on function public.create_staff_late_order_request(uuid, date, text, integer, text, uuid) to authenticated;

create or replace function public.update_staff_late_order_request(
  p_request_id uuid,
  p_requested_summary text,
  p_quantity integer,
  p_special_instructions text default null,
  p_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
  v_summary text := btrim(p_requested_summary);
  v_instructions text;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.requester_profile_id <> v_actor then
    raise exception 'Request access denied';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be edited';
  end if;

  if p_expected_updated_at is not null and v_request.updated_at <> p_expected_updated_at then
    raise exception 'Request was updated elsewhere; refresh and try again';
  end if;

  perform private.assert_staff_late_order_request_window(
    v_actor,
    v_request.provider_id,
    v_request.scheduled_delivery_date,
    now(),
    v_request.office_location_id
  );

  if v_summary is null or char_length(v_summary) = 0 or char_length(v_summary) > 500 then
    raise exception 'Request summary is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  v_instructions := nullif(btrim(coalesce(p_special_instructions, '')), '');
  if v_instructions is not null and char_length(v_instructions) > 500 then
    raise exception 'Special instructions are too long';
  end if;

  update private.staff_late_order_requests
  set
    requested_summary = v_summary,
    quantity = p_quantity,
    special_instructions = v_instructions
  where id = p_request_id;

  perform private.insert_staff_late_order_request_event(
    p_request_id, 'updated', v_actor,
    jsonb_build_object('quantity', p_quantity)
  );
end;
$$;

drop function if exists public.list_staff_late_order_eligible_cycles();

create or replace function public.list_staff_late_order_eligible_cycles(
  p_office_location_id uuid default null
)
returns table (
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_today date := private.jamaica_today_date();
  v_location_id uuid;
  v_delivery date;
  v_order_date date;
  v_provider record;
  v_next_delivery date;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_active_lunch_ordering_profile(v_actor) then
    return;
  end if;

  if p_office_location_id is not null then
    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = p_office_location_id
        and ol.is_active = true
    ) then
      raise exception 'Delivery location is invalid or inactive';
    end if;
    v_location_id := p_office_location_id;
  else
    select p.default_office_location_id into v_location_id from public.profiles p where p.id = v_actor;
    if v_location_id is null then
      return;
    end if;

    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = v_location_id
        and ol.is_active = true
    ) then
      return;
    end if;
  end if;

  v_next_delivery := public.delivery_date_for_order_date(v_today, v_location_id);

  for v_provider in
    select lp.id, lp.name
    from public.lunch_providers lp
    where lp.active and lp.accepts_late_orders
    order by lp.name
  loop
    for v_delivery in
      select dd.delivery_date
      from (
        select v_today as delivery_date
        union
        select v_next_delivery
      ) dd
      where dd.delivery_date is not null
    loop
      begin
        perform private.assert_staff_late_order_request_window(
          v_actor,
          v_provider.id,
          v_delivery,
          now(),
          v_location_id
        );
        v_order_date := public.order_date_for_delivery_date(v_delivery, v_location_id);
        provider_id := v_provider.id;
        provider_name := v_provider.name;
        order_date := v_order_date;
        scheduled_delivery_date := v_delivery;
        return next;
      exception when others then
        continue;
      end;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.list_staff_late_order_eligible_cycles(uuid) from public, anon;
grant execute on function public.list_staff_late_order_eligible_cycles(uuid) to authenticated;

create or replace function public.fulfill_staff_late_order_request(
  p_request_id uuid,
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
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
  v_order_id uuid;
  v_location uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.status = 'fulfilled' then
    return v_request.fulfilled_order_id;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be fulfilled';
  end if;

  v_location := coalesce(p_office_location_id, v_request.office_location_id);

  perform private.assert_staff_late_order_request_window(
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date,
    now(),
    v_location
  );

  if private.profile_has_submitted_late_order(
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date
  ) then
    raise exception 'A late order already exists for this employee, provider, and delivery date';
  end if;

  v_order_id := private.create_hr_late_order_core(
    v_actor,
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date,
    p_items,
    p_special_instructions,
    v_location
  );

  update private.staff_late_order_requests
  set status = 'fulfilled',
      fulfilled_at = now(),
      fulfilled_order_id = v_order_id,
      reviewed_by = v_actor
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Request is no longer pending';
  end if;

  perform private.insert_staff_late_order_request_event(
    p_request_id, 'fulfilled', v_actor,
    jsonb_build_object('fulfilled_order_id', v_order_id)
  );

  perform private.safe_notify_staff_late_order_request_status(
    p_request_id, 'staff.late_order_request_fulfilled'
  );

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);

  return v_order_id;
end;
$$;

revoke execute on function public.fulfill_staff_late_order_request(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.fulfill_staff_late_order_request(uuid, jsonb, text, uuid) to authenticated;
