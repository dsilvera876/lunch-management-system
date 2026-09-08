-- Test helper: reconcile all non-cancelled orders in a lunch period so finalization
-- tests remain valid after delivery-reconciliation blocking was added.
-- The enclosing transaction always rolls back.

reset role;

create or replace function pg_temp.reconcile_lunch_period_orders(p_period_id uuid)
returns void
language plpgsql
as $$
begin
  update public.orders o
  set
    delivery_state = 'delivered',
    financial_disposition = 'chargeable',
    actual_delivery_date = coalesce(o.actual_delivery_date, ld.lunch_date)
  from public.lunch_days ld
  join public.lunch_periods lp on lp.id = p_period_id
  where o.lunch_day_id = ld.id
    and ld.order_date between lp.start_date and lp.end_date
    and o.status <> 'cancelled'
    and (
      o.delivery_state in ('pending', 'issue_open')
      or o.financial_disposition = 'on_hold'
    );
end;
$$;

create or replace function pg_temp.reconcile_lunch_period_orders_by_label(p_label text)
returns void
language plpgsql
as $$
declare
  v_period_id uuid;
begin
  select id
  into v_period_id
  from public.lunch_periods
  where label = p_label;

  if v_period_id is null then
    raise exception 'Lunch period % not found for reconciliation helper', p_label;
  end if;

  perform pg_temp.reconcile_lunch_period_orders(v_period_id);
end;
$$;
