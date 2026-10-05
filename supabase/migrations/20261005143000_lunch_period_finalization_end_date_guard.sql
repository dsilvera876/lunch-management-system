-- ============================================================
-- Block lunch period finalization until the period has fully
-- ended on the Jamaica business calendar (end_date < today).
-- ============================================================

create or replace function private.jamaica_today_date()
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(
    case
      when nullif(current_setting('app.pgtap_test_session', true), '') is not distinct from 'true'
      then nullif(current_setting('test.jamaica_today', true), '')::date
    end,
    (timezone('America/Jamaica', now()))::date
  );
$$;

create or replace function public.jamaica_today_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.jamaica_today_date();
$$;

create or replace function public.finalize_lunch_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_subsidy numeric;
  v_unreconciled bigint;
  v_end_date date;
  v_status text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_finalize_lunch_periods()) then
    raise exception 'Lunch period finalization access required';
  end if;

  select lp.end_date, lp.status
  into v_end_date, v_status
  from public.lunch_periods lp
  where lp.id = p_period_id
  for update;

  if not found then
    raise exception 'Lunch period does not exist';
  end if;

  if v_end_date >= private.jamaica_today_date() then
    raise exception 'This lunch period cannot be finalized until it has ended.';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open lunch periods can be finalized';
  end if;

  v_unreconciled := private.count_unreconciled_delivery_orders(p_period_id);

  if v_unreconciled > 0 then
    raise exception
      'This lunch period cannot be finalized because % order(s) still require delivery reconciliation.',
      v_unreconciled;
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

  perform set_config('app.allow_lunch_period_write', '', true);
end;
$$;
