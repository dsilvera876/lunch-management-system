-- Employee directory for HR late-order creation (names + searchable emails).

create or replace function public.list_late_order_employee_profiles()
returns table (
  id uuid,
  full_name text,
  email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'Operational order access required';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.full_name nulls last, u.email;
end;
$$;

revoke execute on function public.list_late_order_employee_profiles() from public, anon;
grant execute on function public.list_late_order_employee_profiles() to authenticated;
