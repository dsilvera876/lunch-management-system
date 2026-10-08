-- HR pending-request list: expose whether fulfillment window is still open (same rules as fulfill RPC).

create or replace function private.staff_late_order_request_fulfillment_window_open(
  p_requester_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_as_of timestamptz default now(),
  p_office_location_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_staff_late_order_request_window(
    p_requester_profile_id,
    p_provider_id,
    p_scheduled_delivery_date,
    p_as_of,
    p_office_location_id
  );
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.staff_late_order_request_fulfillment_window_open(uuid, uuid, date, timestamptz, uuid) from public;

drop function if exists public.list_pending_staff_late_order_requests_for_hr();

create or replace function public.list_pending_staff_late_order_requests_for_hr()
returns table (
  id uuid,
  requester_profile_id uuid,
  requester_name text,
  requester_email text,
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date,
  requested_summary text,
  quantity integer,
  special_instructions text,
  office_location_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  fulfillment_window_open boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  return query
  select
    r.id,
    r.requester_profile_id,
    p.full_name,
    u.email::text,
    r.provider_id,
    lp.name,
    r.order_date,
    r.scheduled_delivery_date,
    r.requested_summary,
    r.quantity,
    r.special_instructions,
    r.office_location_id,
    r.created_at,
    r.updated_at,
    private.staff_late_order_request_fulfillment_window_open(
      r.requester_profile_id,
      r.provider_id,
      r.scheduled_delivery_date,
      now(),
      r.office_location_id
    ) as fulfillment_window_open
  from private.staff_late_order_requests r
  inner join public.profiles p on p.id = r.requester_profile_id
  inner join auth.users u on u.id = r.requester_profile_id
  inner join public.lunch_providers lp on lp.id = r.provider_id
  where r.status = 'pending'
  order by r.created_at asc;
end;
$$;

revoke execute on function public.list_pending_staff_late_order_requests_for_hr() from public, anon;
grant execute on function public.list_pending_staff_late_order_requests_for_hr() to authenticated;
