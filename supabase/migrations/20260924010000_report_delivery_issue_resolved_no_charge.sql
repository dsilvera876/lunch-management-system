-- Atomically report a delivery issue with "no replacement / no charge" and resolve waived,
-- matching report_order_delivery_issue + resolve_order_no_charge in one transaction.

create or replace function public.report_order_delivery_issue_resolved_no_charge(
  p_order_id uuid,
  p_issue_type text,
  p_hr_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_notes text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  perform private.assert_valid_delivery_issue_type(p_issue_type);

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot receive delivery issues';
  end if;

  if v_order.delivery_state in ('issue_open', 'resolved') then
    raise exception 'Order already has a recorded delivery issue outcome';
  end if;

  v_notes := private.normalize_hr_delivery_notes(p_hr_notes);

  update public.orders
  set
    delivery_issue_type = p_issue_type,
    delivery_resolution_type = 'no_replacement_no_charge',
    delivery_state = 'resolved',
    financial_disposition = 'waived'
  where id = p_order_id;

  if v_notes is not null then
    perform private.set_order_hr_delivery_notes(p_order_id, v_notes);
  end if;

  perform private.append_order_delivery_event(
    p_order_id,
    'issue_reported',
    jsonb_build_object(
      'issue_type', p_issue_type,
      'resolution_type', 'no_replacement_no_charge',
      'hr_notes', v_notes,
      'prior_delivery_state', v_order.delivery_state,
      'prior_financial_disposition', v_order.financial_disposition,
      'resolved_no_charge', true
    )
  );

  perform private.append_order_delivery_event(
    p_order_id,
    'charge_waived',
    jsonb_build_object(
      'hr_notes', v_notes,
      'prior_total', public.calculate_order_total(p_order_id),
      'resolved_no_charge', true
    )
  );
end;
$$;

revoke execute on function public.report_order_delivery_issue_resolved_no_charge(uuid, text, text)
  from public, anon;
grant execute on function public.report_order_delivery_issue_resolved_no_charge(uuid, text, text)
  to authenticated;
