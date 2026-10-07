-- Pre-location summary: eligible delivery dates across active offices (no provider details).

create or replace function public.staff_late_order_new_request_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_dates date[];
begin
  if v_actor is null or not private.is_active_lunch_ordering_profile(v_actor) then
    return jsonb_build_object(
      'available', false,
      'eligible_delivery_dates', '[]'::jsonb
    );
  end if;

  select coalesce(
    array_agg(distinct c.scheduled_delivery_date order by c.scheduled_delivery_date),
    '{}'::date[]
  )
  into v_dates
  from public.office_locations ol
  cross join lateral public.list_staff_late_order_eligible_cycles(ol.id) c
  where ol.is_active;

  return jsonb_build_object(
    'available', coalesce(array_length(v_dates, 1), 0) > 0,
    'eligible_delivery_dates', coalesce(
      (select jsonb_agg(d order by d) from unnest(v_dates) as d),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.staff_late_order_new_request_summary() from public, anon;
grant execute on function public.staff_late_order_new_request_summary() to authenticated;

create or replace function public.staff_late_order_new_request_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (public.staff_late_order_new_request_summary()->>'available')::boolean,
    false
  );
$$;

revoke execute on function public.staff_late_order_new_request_available() from public, anon;
grant execute on function public.staff_late_order_new_request_available() to authenticated;
