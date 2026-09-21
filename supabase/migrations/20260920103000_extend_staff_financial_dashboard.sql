-- Extend staff My Spend dashboard with calendar-week totals and previous lunch period summary.
-- Uses existing private.financial_subsidy_summary / employee_daily_subsidy_breakdown only.

create or replace function public.get_my_financial_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_today date;
  v_month_start date;
  v_month_end date;
  v_week_start date;
  v_week_end date;
  v_current_period record;
  v_previous_period record;
  v_recent_months jsonb := '[]'::jsonb;
  v_month_offset integer;
  v_ref date;
  v_bounds record;
  v_month_summary record;
  v_period_summary record;
  v_previous_period_summary record;
  v_period_orders jsonb;
  v_period_daily jsonb;
  v_previous_period_daily jsonb;
  v_previous_period_orders jsonb;
  v_current_period_payload jsonb := null;
  v_previous_period_payload jsonb := null;
  v_today_summary record;
  v_month_scope_summary record;
  v_week_scope_summary record;
  v_daily_subsidy numeric;
begin
  v_user_id := (select private.current_user_id());

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_daily_subsidy := public.get_daily_lunch_subsidy();
  v_today := public.jamaica_today_date();

  select b.start_date, b.end_date
  into v_month_start, v_month_end
  from public.jamaica_month_bounds(v_today) b;

  v_week_start := v_today - (extract(isodow from v_today)::int - 1);
  v_week_end := v_week_start + 6;

  select *
  into v_today_summary
  from private.financial_subsidy_summary(
    v_user_id,
    v_today,
    v_today,
    null,
    v_daily_subsidy
  ) s;

  select *
  into v_month_scope_summary
  from private.financial_subsidy_summary(
    v_user_id,
    v_month_start,
    v_month_end,
    null,
    v_daily_subsidy
  ) s;

  select *
  into v_week_scope_summary
  from private.financial_subsidy_summary(
    v_user_id,
    v_week_start,
    v_week_end,
    null,
    v_daily_subsidy
  ) s;

  for v_month_offset in 0..2 loop
    v_ref := (
      date_trunc('month', v_today)
      - (v_month_offset || ' months')::interval
    )::date;

    select b.start_date, b.end_date
    into v_bounds
    from public.jamaica_month_bounds(v_ref) b;

    select *
    into v_month_summary
    from private.financial_subsidy_summary(
      v_user_id,
      v_bounds.start_date,
      v_bounds.end_date,
      null,
      v_daily_subsidy
    ) s;

    v_recent_months := v_recent_months || jsonb_build_array(
      jsonb_build_object(
        'year', extract(year from v_ref)::int,
        'month', extract(month from v_ref)::int,
        'label', to_char(v_ref, 'FMMonth YYYY'),
        'start_date', v_bounds.start_date,
        'end_date', v_bounds.end_date,
        'total', v_month_summary.gross_total,
        'gross', v_month_summary.gross_total,
        'subsidy_used', v_month_summary.subsidy_used,
        'net_deduction', v_month_summary.net_deduction
      )
    );
  end loop;

  select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
  into v_current_period
  from public.lunch_periods lp
  where lp.is_current = true
  limit 1;

  if found then
    select *
    into v_period_summary
    from private.financial_subsidy_summary(
      v_user_id,
      null,
      null,
      v_current_period.id,
      null
    ) s;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', q.order_id,
          'order_date', q.order_date,
          'delivery_date', q.delivery_date,
          'provider_name', q.provider_name,
          'order_status', q.order_status,
          'order_total', q.order_total,
          'office_location_name', q.office_location_name,
          'office_location_address', q.office_location_address
        )
        order by q.order_date, q.order_id
      ),
      '[]'::jsonb
    )
    into v_period_orders
    from private.qualifying_financial_orders(
      v_user_id,
      null,
      null,
      v_current_period.id
    ) q;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_date', d.order_date,
          'gross', d.daily_gross,
          'subsidy_used', d.subsidy_used,
          'net_deduction', d.net_deduction,
          'order_count', d.order_count
        )
        order by d.order_date desc
      ),
      '[]'::jsonb
    )
    into v_period_daily
    from private.employee_daily_subsidy_breakdown(
      v_user_id,
      null,
      null,
      v_current_period.id,
      null
    ) d;

    v_current_period_payload := jsonb_build_object(
      'period_id', v_current_period.id,
      'label', v_current_period.label,
      'start_date', v_current_period.start_date,
      'end_date', v_current_period.end_date,
      'status', v_current_period.status,
      'daily_subsidy_rate',
        private.effective_daily_lunch_subsidy(v_current_period.id),
      'order_count', v_period_summary.order_count,
      'qualifying_order_days', v_period_summary.qualifying_order_days,
      'period_total', v_period_summary.gross_total,
      'gross', v_period_summary.gross_total,
      'subsidy_used', v_period_summary.subsidy_used,
      'net_deduction', v_period_summary.net_deduction,
      'orders', v_period_orders,
      'daily_summary', v_period_daily
    );

    select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
    into v_previous_period
    from public.lunch_periods lp
    where lp.id <> v_current_period.id
      and lp.end_date < v_current_period.start_date
    order by lp.end_date desc
    limit 1;

    if not found then
      select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
      into v_previous_period
      from public.lunch_periods lp
      where lp.id <> v_current_period.id
      order by lp.end_date desc
      limit 1;
    end if;
  else
    select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
    into v_previous_period
    from public.lunch_periods lp
    order by lp.end_date desc
    limit 1;
  end if;

  if found then
    select *
    into v_previous_period_summary
    from private.financial_subsidy_summary(
      v_user_id,
      null,
      null,
      v_previous_period.id,
      null
    ) s;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', q.order_id,
          'order_date', q.order_date,
          'delivery_date', q.delivery_date,
          'provider_name', q.provider_name,
          'order_status', q.order_status,
          'order_total', q.order_total,
          'office_location_name', q.office_location_name,
          'office_location_address', q.office_location_address
        )
        order by q.order_date, q.order_id
      ),
      '[]'::jsonb
    )
    into v_previous_period_orders
    from private.qualifying_financial_orders(
      v_user_id,
      null,
      null,
      v_previous_period.id
    ) q;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_date', d.order_date,
          'gross', d.daily_gross,
          'subsidy_used', d.subsidy_used,
          'net_deduction', d.net_deduction,
          'order_count', d.order_count
        )
        order by d.order_date desc
      ),
      '[]'::jsonb
    )
    into v_previous_period_daily
    from private.employee_daily_subsidy_breakdown(
      v_user_id,
      null,
      null,
      v_previous_period.id,
      null
    ) d;

    v_previous_period_payload := jsonb_build_object(
      'period_id', v_previous_period.id,
      'label', v_previous_period.label,
      'start_date', v_previous_period.start_date,
      'end_date', v_previous_period.end_date,
      'status', v_previous_period.status,
      'daily_subsidy_rate',
        private.effective_daily_lunch_subsidy(v_previous_period.id),
      'order_count', v_previous_period_summary.order_count,
      'qualifying_order_days', v_previous_period_summary.qualifying_order_days,
      'period_total', v_previous_period_summary.gross_total,
      'gross', v_previous_period_summary.gross_total,
      'subsidy_used', v_previous_period_summary.subsidy_used,
      'net_deduction', v_previous_period_summary.net_deduction,
      'orders', v_previous_period_orders,
      'daily_summary', v_previous_period_daily
    );
  end if;

  return jsonb_build_object(
    'daily_lunch_subsidy', v_daily_subsidy,
    'today', jsonb_build_object(
      'gross', v_today_summary.gross_total,
      'subsidy_used', v_today_summary.subsidy_used,
      'net_deduction', v_today_summary.net_deduction,
      'qualifying_order_days', v_today_summary.qualifying_order_days,
      'order_count', v_today_summary.order_count
    ),
    'current_week', jsonb_build_object(
      'gross', v_week_scope_summary.gross_total,
      'subsidy_used', v_week_scope_summary.subsidy_used,
      'net_deduction', v_week_scope_summary.net_deduction,
      'qualifying_order_days', v_week_scope_summary.qualifying_order_days,
      'order_count', v_week_scope_summary.order_count,
      'start_date', v_week_start,
      'end_date', v_week_end
    ),
    'current_month', jsonb_build_object(
      'gross', v_month_scope_summary.gross_total,
      'subsidy_used', v_month_scope_summary.subsidy_used,
      'net_deduction', v_month_scope_summary.net_deduction,
      'qualifying_order_days', v_month_scope_summary.qualifying_order_days,
      'order_count', v_month_scope_summary.order_count,
      'start_date', v_month_start,
      'end_date', v_month_end
    ),
    'today_total', v_today_summary.gross_total,
    'current_month_total', v_month_scope_summary.gross_total,
    'recent_months', v_recent_months,
    'current_period', v_current_period_payload,
    'previous_period', v_previous_period_payload
  );
end;
$$;

revoke execute on function public.get_my_financial_dashboard() from public, anon;
grant execute on function public.get_my_financial_dashboard() to authenticated;
