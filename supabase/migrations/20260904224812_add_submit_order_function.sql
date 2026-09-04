create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
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

  insert into public.orders (
    profile_id,
    lunch_day_id
  )
  values (
    (select auth.uid()),
    p_lunch_day_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_menu_item_id :=
        (v_item ->> 'menu_item_id')::uuid;

      v_quantity :=
        (v_item ->> 'quantity')::integer;
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
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

revoke execute
on function public.submit_order(uuid, jsonb)
from public, anon;

grant execute
on function public.submit_order(uuid, jsonb)
to authenticated;