-- Fulfillment must validate the request (or HR override) office location, not profile default.

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
