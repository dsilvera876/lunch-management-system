-- Allow a cancelled order to be replaced by a new order for the same lunch day.
alter table public.orders
drop constraint if exists one_order_per_user_per_lunch_day;

create unique index one_active_order_per_user_per_lunch_day
on public.orders (profile_id, lunch_day_id)
where status <> 'cancelled';


-- ============================================================
-- Cancel order
-- ============================================================

create or replace function public.cancel_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> (select auth.uid()) then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be cancelled';
  end if;

  select status, order_deadline
  into v_day_status, v_deadline
  from public.lunch_days
  where id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id;
end;
$$;

revoke execute
on function public.cancel_order(uuid)
from public, anon;

grant execute
on function public.cancel_order(uuid)
to authenticated;


-- ============================================================
-- Replace order items atomically
-- ============================================================

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> (select auth.uid()) then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be edited';
  end if;

  select status, order_deadline
  into v_day_status, v_deadline
  from public.lunch_days
  where id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;
end;
$$;

revoke execute
on function public.replace_order_items(uuid, jsonb)
from public, anon;

grant execute
on function public.replace_order_items(uuid, jsonb)
to authenticated;