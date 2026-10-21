create or replace function public.list_operational_order_display_names(
  p_order_ids uuid[]
)
returns table (
  order_id uuid,
  employee_name text,
  late_order_created_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    private.can_view_hr_operational_data()
    or private.is_worker_service_caller()
  ) then
    raise exception 'HR operational order access is required.'
      using errcode = '42501';
  end if;

  if p_order_ids is null then
    raise exception 'Order IDs are required.'
      using errcode = '22004';
  end if;

  if cardinality(p_order_ids) > 200 then
    raise exception 'At most 200 order IDs may be requested.'
      using errcode = '22023';
  end if;

  if array_position(p_order_ids, null::uuid) is not null then
    raise exception 'Order IDs must not contain null values.'
      using errcode = '22004';
  end if;

  return query
  select
    orders.id as order_id,
    employee.full_name as employee_name,
    late_creator.full_name as late_order_created_by_name
  from (
    select distinct requested.order_id
    from unnest(p_order_ids) as requested(order_id)
  ) as requested
  join public.orders as orders
    on orders.id = requested.order_id
  left join public.profiles as employee
    on employee.id = orders.profile_id
  left join public.profiles as late_creator
    on late_creator.id = orders.late_order_created_by;
end;
$$;

revoke all on function public.list_operational_order_display_names(uuid[]) from public;
revoke all on function public.list_operational_order_display_names(uuid[]) from anon;
revoke all on function public.list_operational_order_display_names(uuid[]) from authenticated;
revoke all on function public.list_operational_order_display_names(uuid[]) from service_role;

grant execute on function public.list_operational_order_display_names(uuid[]) to authenticated;
grant execute on function public.list_operational_order_display_names(uuid[]) to service_role;
