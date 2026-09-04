create or replace function public.fulfill_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  select status
  into v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_status <> 'submitted' then
    raise exception 'Only submitted orders can be fulfilled';
  end if;

  update public.orders
  set status = 'fulfilled'
  where id = p_order_id;
end;
$$;

revoke execute
on function public.fulfill_order(uuid)
from public, anon;

grant execute
on function public.fulfill_order(uuid)
to authenticated;