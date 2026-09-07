-- ============================================================
-- Batch 2B: Financial summaries, finalization, export data
-- ============================================================

alter table public.lunch_periods
add column status text not null default 'open'
  constraint lunch_periods_status_check
    check (status in ('open', 'finalized'));

create index idx_lunch_periods_status
  on public.lunch_periods (status);


-- ------------------------------------------------------------
-- Jamaica calendar helpers
-- ------------------------------------------------------------

create or replace function public.jamaica_today_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (timezone('America/Jamaica', now()))::date;
$$;

revoke all on function public.jamaica_today_date() from public;
grant execute on function public.jamaica_today_date() to authenticated;

create or replace function public.jamaica_month_bounds(p_reference date)
returns table (
  start_date date,
  end_date date
)
language sql
immutable
strict
set search_path = ''
as $$
  select
    make_date(extract(year from p_reference)::int, extract(month from p_reference)::int, 1),
    (
      make_date(extract(year from p_reference)::int, extract(month from p_reference)::int, 1)
      + interval '1 month - 1 day'
    )::date;
$$;

revoke all on function public.jamaica_month_bounds(date) from public;
grant execute on function public.jamaica_month_bounds(date) to authenticated;


-- ------------------------------------------------------------
-- Financial capability helpers
-- ------------------------------------------------------------

create or replace function private.can_view_all_financial_summaries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_view_all_financial_summaries() from public;
grant execute on function private.can_view_all_financial_summaries() to authenticated;

create or replace function private.can_export_financial_summaries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_export_financial_summaries() from public;
grant execute on function private.can_export_financial_summaries() to authenticated;

create or replace function private.can_finalize_lunch_periods()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_finalize_lunch_periods() from public;
grant execute on function private.can_finalize_lunch_periods() to authenticated;


-- ------------------------------------------------------------
-- Order totals and finalized-period guards
-- ------------------------------------------------------------

create or replace function public.calculate_order_total(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(12, 2)
  from public.order_items oi
  where oi.order_id = p_order_id;
$$;

revoke all on function public.calculate_order_total(uuid) from public;
grant execute on function public.calculate_order_total(uuid) to authenticated;

create or replace function private.is_order_in_finalized_period(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    join public.lunch_periods lp
      on ld.order_date between lp.start_date and lp.end_date
    where o.id = p_order_id
      and lp.status = 'finalized'
  );
$$;

create or replace function private.validate_order_not_in_finalized_period(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_order_in_finalized_period(p_order_id)) then
    raise exception 'Orders in finalized lunch periods cannot be modified';
  end if;
end;
$$;


-- ------------------------------------------------------------
-- Authoritative qualifying-order query
-- ------------------------------------------------------------

create or replace function private.qualifying_financial_orders(
  p_profile_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_period_id uuid default null
)
returns table (
  order_id uuid,
  profile_id uuid,
  employee_name text,
  employee_email text,
  order_date date,
  delivery_date date,
  provider_name text,
  order_status text,
  order_total numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.profile_id,
    pr.full_name,
    au.email::text,
    ld.order_date,
    ld.lunch_date,
    lpr.name,
    o.status,
    coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(12, 2)
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  join public.order_items oi on oi.order_id = o.id
  join public.profiles pr on pr.id = o.profile_id
  join auth.users au on au.id = pr.id
  left join public.lunch_providers lpr on lpr.id = ld.provider_id
  where o.status in ('submitted', 'fulfilled')
    and (p_profile_id is null or o.profile_id = p_profile_id)
    and (p_start_date is null or ld.order_date >= p_start_date)
    and (p_end_date is null or ld.order_date <= p_end_date)
    and (
      p_period_id is null
      or exists (
        select 1
        from public.lunch_periods lper
        where lper.id = p_period_id
          and ld.order_date between lper.start_date and lper.end_date
      )
    )
  group by
    o.id,
    o.profile_id,
    pr.full_name,
    au.email,
    ld.order_date,
    ld.lunch_date,
    lpr.name,
    o.status;
$$;

revoke all on function private.qualifying_financial_orders(uuid, date, date, uuid) from public;


-- ------------------------------------------------------------
-- Profile financial access guard
-- ------------------------------------------------------------

create or replace function private.assert_can_view_profile_financials(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if p_profile_id is distinct from (select private.current_user_id())
     and not (select private.can_view_all_financial_summaries()) then
    raise exception 'Not authorized to view financial summaries for this employee';
  end if;
end;
$$;


-- ------------------------------------------------------------
-- Financial totals
-- ------------------------------------------------------------

create or replace function public.financial_total_for_profile(
  p_profile_id uuid,
  p_start_date date,
  p_end_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_view_profile_financials(p_profile_id);

  return coalesce((
    select sum(q.order_total)
    from private.qualifying_financial_orders(
      p_profile_id,
      p_start_date,
      p_end_date,
      null
    ) q
  ), 0)::numeric(12, 2);
end;
$$;

revoke execute on function public.financial_total_for_profile(uuid, date, date) from public, anon;
grant execute on function public.financial_total_for_profile(uuid, date, date) to authenticated;


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
  v_month_total numeric;
  v_period_orders jsonb;
  v_period_total numeric;
  v_period_count bigint;
begin
  v_user_id := (select private.current_user_id());

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_today := public.jamaica_today_date();
  select b.start_date, b.end_date
  into v_month_start, v_month_end
  from public.jamaica_month_bounds(v_today) b;

  for v_month_offset in 0..2 loop
    v_ref := (date_trunc('month', v_today) - (v_month_offset || ' months')::interval)::date;
    select b.start_date, b.end_date
    into v_bounds
    from public.jamaica_month_bounds(v_ref) b;

    v_month_total := public.financial_total_for_profile(
      v_user_id,
      v_bounds.start_date,
      v_bounds.end_date
    );

    v_recent_months := v_recent_months || jsonb_build_array(
      jsonb_build_object(
        'year', extract(year from v_ref)::int,
        'month', extract(month from v_ref)::int,
        'label', to_char(v_ref, 'FMMonth YYYY'),
        'start_date', v_bounds.start_date,
        'end_date', v_bounds.end_date,
        'total', v_month_total
      )
    );
  end loop;

  select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
  into v_current_period
  from public.lunch_periods lp
  where lp.is_current = true
  limit 1;

  if found then
    select
      coalesce(sum(q.order_total), 0)::numeric(12, 2),
      count(*)::bigint,
      coalesce(jsonb_agg(
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
    into v_period_total, v_period_count, v_period_orders
    from private.qualifying_financial_orders(
      v_user_id,
      null,
      null,
      v_current_period.id
    ) q;
  else
    v_period_total := 0;
    v_period_count := 0;
    v_period_orders := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'today_total', public.financial_total_for_profile(v_user_id, v_today, v_today),
    'current_month_total', public.financial_total_for_profile(
      v_user_id,
      v_month_start,
      v_month_end
    ),
    'recent_months', v_recent_months,
    'current_period', case
      when v_current_period.id is null then null
      else jsonb_build_object(
        'period_id', v_current_period.id,
        'label', v_current_period.label,
        'start_date', v_current_period.start_date,
        'end_date', v_current_period.end_date,
        'status', v_current_period.status,
        'order_count', v_period_count,
        'period_total', v_period_total,
        'orders', v_period_orders
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
  v_grand_total numeric;
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

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'employee_id', e.profile_id,
        'employee_name', e.employee_name,
        'employee_email', e.employee_email,
        'order_count', e.order_count,
        'period_total', e.period_total
      )
      order by e.employee_name nulls last, e.employee_email
    ), '[]'::jsonb),
    coalesce(sum(e.period_total), 0)::numeric(12, 2)
  into v_employees, v_grand_total
  from (
    select
      q.profile_id,
      q.employee_name,
      q.employee_email,
      count(*)::bigint as order_count,
      sum(q.order_total)::numeric(12, 2) as period_total
    from private.qualifying_financial_orders(
      null,
      null,
      null,
      p_period_id
    ) q
    group by q.profile_id, q.employee_name, q.employee_email
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

  return jsonb_build_object(
    'period', jsonb_build_object(
      'period_id', v_period.id,
      'label', v_period.label,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'status', v_period.status,
      'is_current', v_period.is_current
    ),
    'employees', v_employees,
    'orders', v_orders,
    'grand_total', v_grand_total
  );
end;
$$;

revoke execute on function public.get_lunch_period_financial_summary(uuid) from public, anon;
grant execute on function public.get_lunch_period_financial_summary(uuid) to authenticated;


-- ------------------------------------------------------------
-- Export payloads (server-side authorization)
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
  v_total numeric;
  v_count bigint;
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

  select pr.full_name, au.email::text
  into v_employee
  from public.profiles pr
  join auth.users au on au.id = pr.id
  where pr.id = v_user_id;

  select
    coalesce(sum(q.order_total), 0)::numeric(12, 2),
    count(*)::bigint,
    coalesce(jsonb_agg(
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
  into v_total, v_count, v_orders
  from private.qualifying_financial_orders(
    v_user_id,
    null,
    null,
    v_period.id
  ) q;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'period_id', v_period.id,
      'label', v_period.label,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'status', v_period.status
    ),
    'employee', jsonb_build_object(
      'employee_id', v_user_id,
      'employee_name', v_employee.full_name,
      'employee_email', v_employee.email
    ),
    'order_count', v_count,
    'period_total', v_total,
    'orders', v_orders
  );
end;
$$;

revoke execute on function public.get_my_lunch_period_export_data() from public, anon;
grant execute on function public.get_my_lunch_period_export_data() to authenticated;

create or replace function public.get_lunch_period_export_data(p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_export_financial_summaries()) then
    raise exception 'Financial export access required';
  end if;

  return public.get_lunch_period_financial_summary(p_period_id);
end;
$$;

revoke execute on function public.get_lunch_period_export_data(uuid) from public, anon;
grant execute on function public.get_lunch_period_export_data(uuid) to authenticated;


-- ------------------------------------------------------------
-- Finalize lunch period
-- ------------------------------------------------------------

create or replace function public.finalize_lunch_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    status = 'finalized',
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


-- ------------------------------------------------------------
-- Block mutations on finalized periods and orders
-- ------------------------------------------------------------

create or replace function public.update_lunch_period_label(
  p_period_id uuid,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'Label is required';
  end if;

  if exists (
    select 1
    from public.lunch_periods
    where id = p_period_id
      and status = 'finalized'
  ) then
    raise exception 'Finalized lunch periods cannot be modified';
  end if;

  if not exists (
    select 1
    from public.lunch_periods
    where id = p_period_id
  ) then
    raise exception 'Lunch period does not exist';
  end if;

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    label = trim(p_label),
    updated_by = (select private.current_user_id())
  where id = p_period_id;

  perform set_config('app.allow_lunch_period_write', 'false', true);
end;
$$;

create or replace function public.update_latest_lunch_period_end_date(
  p_period_id uuid,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start_date date;
  v_latest_id uuid;
  v_status text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if p_end_date is null then
    raise exception 'End date is required';
  end if;

  select status
  into v_status
  from public.lunch_periods
  where id = p_period_id;

  if v_status = 'finalized' then
    raise exception 'Finalized lunch periods cannot be modified';
  end if;

  select id
  into v_latest_id
  from public.lunch_periods
  order by end_date desc
  limit 1
  for update;

  if v_latest_id is distinct from p_period_id then
    raise exception 'Only the latest lunch period end date may be adjusted';
  end if;

  select start_date
  into v_start_date
  from public.lunch_periods
  where id = p_period_id;

  if p_end_date < v_start_date then
    raise exception 'End date must be on or after the period start date';
  end if;

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    end_date = p_end_date,
    updated_by = (select private.current_user_id())
  where id = p_period_id;

  perform set_config('app.allow_lunch_period_write', 'false', true);
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
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

  perform private.validate_order_not_in_finalized_period(p_order_id);
  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

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

  perform private.validate_order_not_in_finalized_period(p_order_id);
  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

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
      lunch_day_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;
end;
$$;
