-- Expose delivery location on self-service late-order submission listings.
drop function if exists public.get_my_staff_late_order_requests();

create function public.get_my_staff_late_order_requests()
returns table (
  id uuid,
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date,
  status text,
  requested_summary text,
  quantity integer,
  special_instructions text,
  decline_reason text,
  fulfilled_order_id uuid,
  office_location_id uuid,
  office_location_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    r.id,
    r.provider_id,
    lp.name,
    r.order_date,
    r.scheduled_delivery_date,
    r.status,
    r.requested_summary,
    r.quantity,
    r.special_instructions,
    r.decline_reason,
    r.fulfilled_order_id,
    r.office_location_id,
    ol.name,
    r.created_at,
    r.updated_at
  from private.staff_late_order_requests r
  inner join public.lunch_providers lp on lp.id = r.provider_id
  inner join public.office_locations ol on ol.id = r.office_location_id
  where r.requester_profile_id = v_actor
  order by r.scheduled_delivery_date desc, r.created_at desc
  limit 50;
end;
$$;

revoke execute on function public.get_my_staff_late_order_requests() from public, anon;
grant execute on function public.get_my_staff_late_order_requests() to authenticated;
