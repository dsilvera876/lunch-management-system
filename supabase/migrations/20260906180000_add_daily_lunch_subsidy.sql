-- ============================================================
-- Global daily lunch subsidy + finalized-period snapshot
-- ============================================================

alter table public.app_settings
add column daily_lunch_subsidy numeric(12, 2) not null default 0
  constraint app_settings_daily_lunch_subsidy_nonneg
    check (daily_lunch_subsidy >= 0);

alter table public.lunch_periods
add column finalized_daily_subsidy numeric(12, 2)
  constraint lunch_periods_finalized_daily_subsidy_nonneg
    check (finalized_daily_subsidy is null or finalized_daily_subsidy >= 0);


-- ------------------------------------------------------------
-- Subsidy authorization
-- ------------------------------------------------------------

create or replace function private.can_update_daily_lunch_subsidy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_update_daily_lunch_subsidy() from public;
grant execute on function private.can_update_daily_lunch_subsidy() to authenticated;


-- ------------------------------------------------------------
-- Global subsidy read/update
-- ------------------------------------------------------------

create or replace function public.get_daily_lunch_subsidy()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select s.daily_lunch_subsidy
  from public.app_settings s
  where s.id = 1;
$$;

revoke execute on function public.get_daily_lunch_subsidy() from public, anon;
grant execute on function public.get_daily_lunch_subsidy() to authenticated;

create or replace function public.update_daily_lunch_subsidy(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_update_daily_lunch_subsidy()) then
    raise exception 'Daily lunch subsidy update access required';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Daily lunch subsidy must be zero or greater';
  end if;

  update public.app_settings
  set
    daily_lunch_subsidy = p_amount::numeric(12, 2),
    updated_at = now()
  where id = 1;
end;
$$;

revoke execute on function public.update_daily_lunch_subsidy(numeric) from public, anon;
grant execute on function public.update_daily_lunch_subsidy(numeric) to authenticated;


-- ------------------------------------------------------------
-- Effective subsidy for a lunch period (current vs snapshotted)
-- ------------------------------------------------------------

create or replace function private.effective_daily_lunch_subsidy(p_period_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select lp.finalized_daily_subsidy
      from public.lunch_periods lp
      where lp.id = p_period_id
        and lp.status = 'finalized'
        and lp.finalized_daily_subsidy is not null
    ),
    (
      select s.daily_lunch_subsidy
      from public.app_settings s
      where s.id = 1
    ),
    0
  )::numeric(12, 2);
$$;

revoke all on function private.effective_daily_lunch_subsidy(uuid) from public;


-- ------------------------------------------------------------
-- Daily gross spend aggregation (per employee, per order date)
-- ------------------------------------------------------------

create or replace function private.employee_daily_gross_spend(
  p_profile_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_period_id uuid default null
)
returns table (
  profile_id uuid,
  order_date date,
  daily_gross numeric,
  order_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    q.profile_id,
    q.order_date,
    sum(q.order_total)::numeric(12, 2) as daily_gross,
    count(*)::bigint as order_count
  from private.qualifying_financial_orders(
    p_profile_id,
    p_start_date,
    p_end_date,
    p_period_id
  ) q
  group by q.profile_id, q.order_date;
$$;

revoke all on function private.employee_daily_gross_spend(uuid, date, date, uuid) from public;


-- ------------------------------------------------------------
-- Subsidy totals for a scope
-- ------------------------------------------------------------

create or replace function private.financial_subsidy_summary(
  p_profile_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_period_id uuid default null,
  p_daily_subsidy numeric default null
)
returns table (
  gross_total numeric,
  subsidy_used numeric,
  net_deduction numeric,
  order_count bigint,
  qualifying_order_days bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subsidy numeric;
begin
  v_subsidy := coalesce(
    p_daily_subsidy,
    private.effective_daily_lunch_subsidy(p_period_id)
  );

  return query
  select
    coalesce(sum(d.daily_gross), 0)::numeric(12, 2) as gross_total,
    coalesce(sum(least(d.daily_gross, v_subsidy)), 0)::numeric(12, 2) as subsidy_used,
    coalesce(
      sum(d.daily_gross - least(d.daily_gross, v_subsidy)),
      0
    )::numeric(12, 2) as net_deduction,
    coalesce(sum(d.order_count), 0)::bigint as order_count,
    count(d.order_date)::bigint as qualifying_order_days
  from private.employee_daily_gross_spend(
    p_profile_id,
    p_start_date,
    p_end_date,
    p_period_id
  ) d;
end;
$$;

revoke all on function private.financial_subsidy_summary(uuid, date, date, uuid, numeric) from public;


-- ------------------------------------------------------------
-- Daily subsidy breakdown (per employee, per order date)
-- ------------------------------------------------------------

create or replace function private.employee_daily_subsidy_breakdown(
  p_profile_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_period_id uuid default null,
  p_daily_subsidy numeric default null
)
returns table (
  profile_id uuid,
  order_date date,
  daily_gross numeric,
  subsidy_used numeric,
  net_deduction numeric,
  order_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subsidy numeric;
begin
  v_subsidy := coalesce(
    p_daily_subsidy,
    private.effective_daily_lunch_subsidy(p_period_id)
  );

  return query
  select
    d.profile_id,
    d.order_date,
    d.daily_gross,
    least(d.daily_gross, v_subsidy)::numeric(12, 2) as subsidy_used,
    (d.daily_gross - least(d.daily_gross, v_subsidy))::numeric(12, 2) as net_deduction,
    d.order_count
  from private.employee_daily_gross_spend(
    p_profile_id,
    p_start_date,
    p_end_date,
    p_period_id
  ) d
  order by d.order_date, d.profile_id;
end;
$$;

revoke all on function private.employee_daily_subsidy_breakdown(uuid, date, date, uuid, numeric) from public;


-- ------------------------------------------------------------
-- Staff financial dashboard payload
-- ------------------------------------------------------------

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
  v_current_period record;
  v_recent_months jsonb := '[]'::jsonb;
  v_month_offset integer;
  v_ref date;
  v_bounds record;
  v_month_summary record;
  v_period_summary record;
  v_period_orders jsonb;
  v_period_daily jsonb;
  v_today_summary record;
  v_month_scope_summary record;
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

  for v_month_offset in 0..2 loop
    v_ref := (date_trunc('month', v_today) - (v_month_offset || ' months')::interval)::date;
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

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'order_id', q.order_id,
        'order_date', q.order_date,
        'delivery_date', q.delivery_date,
        'provider_name', q.provider_name,
        'order_status', q.order_status,
        'order_total', q.order_total
      )
      order by q.order_date, q.order_id
    ), '[]'::jsonb)
    into v_period_orders
    from private.qualifying_financial_orders(
      v_user_id,
      null,
      null,
      v_current_period.id
    ) q;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'order_date', d.order_date,
        'gross', d.daily_gross,
        'subsidy_used', d.subsidy_used,
        'net_deduction', d.net_deduction,
        'order_count', d.order_count
      )
      order by d.order_date
    ), '[]'::jsonb)
    into v_period_daily
    from private.employee_daily_subsidy_breakdown(
      v_user_id,
      null,
      null,
      v_current_period.id,
      null
    ) d;
  else
    v_period_summary.gross_total := 0;
    v_period_summary.subsidy_used := 0;
    v_period_summary.net_deduction := 0;
    v_period_summary.order_count := 0;
    v_period_summary.qualifying_order_days := 0;
    v_period_orders := '[]'::jsonb;
    v_period_daily := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'daily_lunch_subsidy', v_daily_subsidy,
    'today', jsonb_build_object(
      'gross', v_today_summary.gross_total,
      'subsidy_used', v_today_summary.subsidy_used,
      'net_deduction', v_today_summary.net_deduction
    ),
    'current_month', jsonb_build_object(
      'gross', v_month_scope_summary.gross_total,
      'subsidy_used', v_month_scope_summary.subsidy_used,
      'net_deduction', v_month_scope_summary.net_deduction
    ),
    'today_total', v_today_summary.gross_total,
    'current_month_total', v_month_scope_summary.gross_total,
    'recent_months', v_recent_months,
    'current_period', case
      when v_current_period.id is null then null
      else jsonb_build_object(
        'period_id', v_current_period.id,
        'label', v_current_period.label,
        'start_date', v_current_period.start_date,
        'end_date', v_current_period.end_date,
        'status', v_current_period.status,
        'daily_subsidy_rate', private.effective_daily_lunch_subsidy(v_current_period.id),
        'order_count', v_period_summary.order_count,
        'qualifying_order_days', v_period_summary.qualifying_order_days,
        'period_total', v_period_summary.gross_total,
        'gross', v_period_summary.gross_total,
        'subsidy_used', v_period_summary.subsidy_used,
        'net_deduction', v_period_summary.net_deduction,
        'orders', v_period_orders,
        'daily_summary', v_period_daily
      )
    end
  );
end;
$$;

revoke execute on function public.get_my_financial_dashboard() from public, anon;
grant execute on function public.get_my_financial_dashboard() to authenticated;


-- ------------------------------------------------------------
-- Management lunch-period financial summary
-- ------------------------------------------------------------

create or replace function public.get_lunch_period_financial_summary(p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period record;
  v_employees jsonb;
  v_orders jsonb;
  v_daily jsonb;
  v_grand_total numeric;
  v_grand_subsidy numeric;
  v_grand_net numeric;
  v_daily_subsidy numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_financial_summaries()) then
    raise exception 'Financial summary access required';
  end if;

  select lp.id, lp.label, lp.start_date, lp.end_date, lp.status, lp.is_current
  into v_period
  from public.lunch_periods lp
  where lp.id = p_period_id;

  if not found then
    raise exception 'Lunch period does not exist';
  end if;

  v_daily_subsidy := private.effective_daily_lunch_subsidy(p_period_id);

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'employee_id', e.profile_id,
        'employee_name', e.employee_name,
        'employee_email', e.employee_email,
        'order_count', e.order_count,
        'qualifying_order_days', e.qualifying_order_days,
        'period_total', e.gross_total,
        'gross', e.gross_total,
        'subsidy_used', e.subsidy_used,
        'net_deduction', e.net_deduction
      )
      order by e.employee_name nulls last, e.employee_email
    ), '[]'::jsonb),
    coalesce(sum(e.gross_total), 0)::numeric(12, 2),
    coalesce(sum(e.subsidy_used), 0)::numeric(12, 2),
    coalesce(sum(e.net_deduction), 0)::numeric(12, 2)
  into v_employees, v_grand_total, v_grand_subsidy, v_grand_net
  from (
    select
      d.profile_id,
      pr.full_name as employee_name,
      au.email::text as employee_email,
      sum(d.order_count)::bigint as order_count,
      count(d.order_date)::bigint as qualifying_order_days,
      sum(d.daily_gross)::numeric(12, 2) as gross_total,
      sum(least(d.daily_gross, v_daily_subsidy))::numeric(12, 2) as subsidy_used,
      sum(d.daily_gross - least(d.daily_gross, v_daily_subsidy))::numeric(12, 2) as net_deduction
    from private.employee_daily_gross_spend(
      null,
      null,
      null,
      p_period_id
    ) d
    join public.profiles pr on pr.id = d.profile_id
    join auth.users au on au.id = pr.id
    group by d.profile_id, pr.full_name, au.email
  ) e;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', q.order_id,
      'employee_id', q.profile_id,
      'employee_name', q.employee_name,
      'employee_email', q.employee_email,
      'order_date', q.order_date,
      'delivery_date', q.delivery_date,
      'provider_name', q.provider_name,
      'order_status', q.order_status,
      'order_total', q.order_total
    )
    order by q.employee_name nulls last, q.order_date, q.order_id
  ), '[]'::jsonb)
  into v_orders
  from private.qualifying_financial_orders(
    null,
    null,
    null,
    p_period_id
  ) q;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'employee_id', d.profile_id,
      'employee_name', pr.full_name,
      'employee_email', au.email::text,
      'order_date', d.order_date,
      'gross', d.daily_gross,
      'subsidy_used', d.subsidy_used,
      'net_deduction', d.net_deduction,
      'order_count', d.order_count
    )
    order by pr.full_name nulls last, d.order_date
  ), '[]'::jsonb)
  into v_daily
  from private.employee_daily_subsidy_breakdown(
    null,
    null,
    null,
    p_period_id,
    null
  ) d
  join public.profiles pr on pr.id = d.profile_id
  join auth.users au on au.id = pr.id;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'period_id', v_period.id,
      'label', v_period.label,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'status', v_period.status,
      'is_current', v_period.is_current,
      'daily_subsidy_rate', v_daily_subsidy
    ),
    'daily_lunch_subsidy', v_daily_subsidy,
    'employees', v_employees,
    'orders', v_orders,
    'daily_summary', v_daily,
    'grand_total', v_grand_total,
    'grand_gross', v_grand_total,
    'grand_subsidy_used', v_grand_subsidy,
    'grand_net_deduction', v_grand_net
  );
end;
$$;

revoke execute on function public.get_lunch_period_financial_summary(uuid) from public, anon;
grant execute on function public.get_lunch_period_financial_summary(uuid) to authenticated;


-- ------------------------------------------------------------
-- Export payloads
-- ------------------------------------------------------------

create or replace function public.get_my_lunch_period_export_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_period record;
  v_employee record;
  v_orders jsonb;
  v_daily jsonb;
  v_summary record;
  v_daily_subsidy numeric;
begin
  v_user_id := (select private.current_user_id());

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
  into v_period
  from public.lunch_periods lp
  where lp.is_current = true
  limit 1;

  if not found then
    raise exception 'No current lunch period configured';
  end if;

  v_daily_subsidy := private.effective_daily_lunch_subsidy(v_period.id);

  select pr.full_name, au.email::text
  into v_employee
  from public.profiles pr
  join auth.users au on au.id = pr.id
  where pr.id = v_user_id;

  select *
  into v_summary
  from private.financial_subsidy_summary(
    v_user_id,
    null,
    null,
    v_period.id,
    null
  ) s;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', q.order_id,
      'order_date', q.order_date,
      'delivery_date', q.delivery_date,
      'provider_name', q.provider_name,
      'order_status', q.order_status,
      'order_total', q.order_total
    )
    order by q.order_date, q.order_id
  ), '[]'::jsonb)
  into v_orders
  from private.qualifying_financial_orders(
    v_user_id,
    null,
    null,
    v_period.id
  ) q;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_date', d.order_date,
      'gross', d.daily_gross,
      'subsidy_used', d.subsidy_used,
      'net_deduction', d.net_deduction,
      'order_count', d.order_count
    )
    order by d.order_date
  ), '[]'::jsonb)
  into v_daily
  from private.employee_daily_subsidy_breakdown(
    v_user_id,
    null,
    null,
    v_period.id,
    null
  ) d;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'period_id', v_period.id,
      'label', v_period.label,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'status', v_period.status,
      'daily_subsidy_rate', v_daily_subsidy
    ),
    'daily_lunch_subsidy', v_daily_subsidy,
    'employee', jsonb_build_object(
      'employee_id', v_user_id,
      'employee_name', v_employee.full_name,
      'employee_email', v_employee.email
    ),
    'order_count', v_summary.order_count,
    'qualifying_order_days', v_summary.qualifying_order_days,
    'period_total', v_summary.gross_total,
    'gross', v_summary.gross_total,
    'subsidy_used', v_summary.subsidy_used,
    'net_deduction', v_summary.net_deduction,
    'orders', v_orders,
    'daily_summary', v_daily
  );
end;
$$;

revoke execute on function public.get_my_lunch_period_export_data() from public, anon;
grant execute on function public.get_my_lunch_period_export_data() to authenticated;


-- ------------------------------------------------------------
-- Finalize lunch period (snapshot global subsidy)
-- ------------------------------------------------------------

create or replace function public.finalize_lunch_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_subsidy numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_finalize_lunch_periods()) then
    raise exception 'Lunch period finalization access required';
  end if;

  if not exists (
    select 1
    from public.lunch_periods
    where id = p_period_id
  ) then
    raise exception 'Lunch period does not exist';
  end if;

  v_current_subsidy := public.get_daily_lunch_subsidy();

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    status = 'finalized',
    finalized_daily_subsidy = v_current_subsidy,
    updated_by = (select private.current_user_id())
  where id = p_period_id
    and status = 'open';

  if not found then
    raise exception 'Only open lunch periods can be finalized';
  end if;

  perform set_config('app.allow_lunch_period_write', 'false', true);
end;
$$;

revoke execute on function public.finalize_lunch_period(uuid) from public, anon;
grant execute on function public.finalize_lunch_period(uuid) to authenticated;
