-- ============================================================
-- Restrict order mutations to trusted RPCs (composition-safe).
-- ============================================================

-- submit_order must bypass revoked table privileges like other order RPCs.
create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(
    p_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    meal_quantity
  )
  values (
    (select auth.uid()),
    p_lunch_day_id,
    v_meal_quantity
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
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
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

revoke execute on function public.submit_order(uuid, jsonb)
from public, anon;

grant execute on function public.submit_order(uuid, jsonb)
to authenticated;

-- Authenticated users may read orders through RLS; mutations go through RPCs.
revoke insert, update, delete, truncate, trigger, references
on public.orders
from authenticated;

revoke insert, update, delete, truncate, trigger, references
on public.order_items
from authenticated;

-- Idempotent: anon must retain no direct table access.
revoke all on public.orders from anon;
revoke all on public.order_items from anon;

-- Idempotent: order mutation RPCs are authenticated-only.
revoke execute on function public.submit_provider_order(uuid, date, jsonb, text)
from public, anon;

grant execute on function public.submit_provider_order(uuid, date, jsonb, text)
to authenticated;

revoke execute on function public.replace_order_items(uuid, jsonb, text)
from public, anon;

grant execute on function public.replace_order_items(uuid, jsonb, text)
to authenticated;

revoke execute on function public.cancel_order(uuid)
from public, anon;

grant execute on function public.cancel_order(uuid)
to authenticated;

revoke execute on function public.fulfill_order(uuid)
from public, anon;

grant execute on function public.fulfill_order(uuid)
to authenticated;

-- Direct-write policies are obsolete once table mutation privileges are revoked.
drop policy if exists "Users can create their own orders" on public.orders;
drop policy if exists "Users can add items to their own orders" on public.order_items;
drop policy if exists "Fulfillment roles can update orders" on public.orders;
drop policy if exists "Fulfillment roles can manage order items" on public.order_items;
