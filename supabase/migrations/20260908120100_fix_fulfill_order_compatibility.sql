-- Restore legacy fulfill_order guard messages while keeping delivery reconciliation.

create or replace function public.mark_order_delivered(
  p_order_id uuid,
  p_actual_delivery_date date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_actual_date date;
  v_prior_total numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be marked delivered';
  end if;

  if v_order.delivery_state <> 'pending' then
    raise exception 'Only pending deliveries can be marked delivered';
  end if;

  v_actual_date := coalesce(p_actual_delivery_date, public.jamaica_today_date());
  v_prior_total := public.calculate_order_total(p_order_id);

  update public.orders
  set
    delivery_state = 'delivered',
    financial_disposition = 'chargeable',
    actual_delivery_date = v_actual_date,
    status = 'fulfilled',
    delivery_issue_type = null,
    delivery_resolution_type = null
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'marked_delivered',
    jsonb_build_object(
      'actual_delivery_date', v_actual_date,
      'order_total', v_prior_total,
      'items', private.order_items_audit_snapshot(p_order_id)
    )
  );
end;
$$;

create or replace function public.fulfill_order(p_order_id uuid)
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

  if not (select private.can_fulfill_orders()) then
    raise exception 'Fulfillment access required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_order.status <> 'submitted' then
    raise exception 'Only submitted orders can be fulfilled';
  end if;

  perform public.mark_order_delivered(p_order_id, null);
end;
$$;

revoke execute on function public.fulfill_order(uuid) from public, anon;
grant execute on function public.fulfill_order(uuid) to authenticated;

revoke execute on function public.mark_order_delivered(uuid, date) from public, anon;
grant execute on function public.mark_order_delivered(uuid, date) to authenticated;
