-- Authoritative check: any new late-order opportunity at an active office for the actor.

create or replace function public.staff_late_order_new_request_available()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
begin
  if v_actor is null then
    return false;
  end if;

  if not private.is_active_lunch_ordering_profile(v_actor) then
    return false;
  end if;

  return exists (
    select 1
    from public.office_locations ol
    cross join lateral public.list_staff_late_order_eligible_cycles(ol.id) c
    where ol.is_active
    limit 1
  );
end;
$$;

revoke execute on function public.staff_late_order_new_request_available() from public, anon;
grant execute on function public.staff_late_order_new_request_available() to authenticated;
