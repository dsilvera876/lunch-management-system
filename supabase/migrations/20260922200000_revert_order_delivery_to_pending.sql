-- Allow HR to undo a mistaken same-day delivery confirmation (delivered → pending).

create or replace function public.revert_order_delivery_to_pending(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be changed';
  end if;

  if v_order.delivery_state <> 'delivered' then
    raise exception 'Only delivered orders can be returned to pending';
  end if;

  update public.orders
  set
    delivery_state = 'pending',
    status = 'submitted',
    actual_delivery_date = null
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'order_adjusted',
    jsonb_build_object('action', 'reverted_to_pending')
  );
end;
$$;

revoke execute on function public.revert_order_delivery_to_pending(uuid)
from public, anon;

grant execute on function public.revert_order_delivery_to_pending(uuid)
to authenticated;
