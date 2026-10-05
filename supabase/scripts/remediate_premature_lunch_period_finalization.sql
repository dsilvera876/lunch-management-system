-- ============================================================
-- ONE-TIME remediation: reopen a lunch period that was finalized
-- while it still contained active Jamaica order dates.
--
-- DO NOT RUN in production/staging without:
--   - business approval and change ticket
--   - verified period UUID (read-only query below)
--   - authorized Accounts operator UUID for updated_by
-- ============================================================

-- ------------------------------------------------------------
-- 1) Read-only: identify candidate periods (run first)
-- ------------------------------------------------------------
/*
select
  lp.id,
  lp.label,
  lp.start_date,
  lp.end_date,
  lp.status,
  lp.finalized_daily_subsidy,
  lp.updated_by,
  lp.updated_at,
  private.jamaica_today_date() as jamaica_today
from public.lunch_periods lp
where lp.status = 'finalized'
  and lp.end_date >= private.jamaica_today_date()
order by lp.end_date desc;
*/

-- ------------------------------------------------------------
-- 2) Narrow remediation (replace placeholders before run)
-- ------------------------------------------------------------
/*
begin;

-- :period_id            uuid  exact affected lunch period
-- :accounts_operator_id uuid  Accounts user performing remediation

do $$
declare
  v_period_id uuid := :'period_id'::uuid;
  v_operator_id uuid := :'accounts_operator_id'::uuid;
  v_row public.lunch_periods%rowtype;
  v_changed integer;
begin
  select *
  into v_row
  from public.lunch_periods lp
  where lp.id = v_period_id
  for update;

  if not found then
    raise exception 'Lunch period does not exist';
  end if;

  if v_row.status is distinct from 'finalized' then
    raise exception 'Expected finalized lunch period, found status %', v_row.status;
  end if;

  if v_row.end_date < private.jamaica_today_date() then
    raise exception
      'Period end date % is before Jamaica today; use normal finalization workflow instead',
      v_row.end_date;
  end if;

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods lp
  set
    status = 'open',
    finalized_daily_subsidy = null,
    updated_by = v_operator_id
  where lp.id = v_period_id
    and lp.status = 'finalized'
    and lp.end_date >= private.jamaica_today_date();

  get diagnostics v_changed = row_count;

  perform set_config('app.allow_lunch_period_write', '', true);

  if v_changed <> 1 then
    raise exception 'Expected exactly one lunch period row to change, changed %', v_changed;
  end if;
end;
$$;

commit;
*/

-- Audit: no dedicated lunch-period finalization event table exists today.
-- Preserve updated_by / updated_at on lunch_periods and record the external
-- change ticket. Previously sent staff finalized notices are not retracted.
