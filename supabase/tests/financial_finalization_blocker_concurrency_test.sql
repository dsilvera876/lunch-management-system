begin;

select plan(27);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.wait_for_advisory_lock(
  p_lock_key bigint,
  p_timeout interval default interval '5 seconds'
)
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    if not pg_try_advisory_lock(p_lock_key) then
      return true;
    end if;
    perform pg_advisory_unlock(p_lock_key);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  return false;
end;
$$;

create or replace function pg_temp.wait_for_dblink(
  p_connection_name text,
  p_timeout interval default interval '5 seconds'
)
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    if extensions.dblink_is_busy(p_connection_name) = 0 then
      return true;
    end if;
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  return false;
end;
$$;

select extensions.dblink_connect(
  'bug8_hr',
  'host=supabase_db_lunch-management-system port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'bug8_accounts',
  'host=supabase_db_lunch-management-system port=5432 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_exec(
  'bug8_accounts',
  $setup$
    delete from public.order_delivery_events
    where order_id in (
      '86100000-0000-4000-8000-000000000001',
      '86100000-0000-4000-8000-000000000002',
      '86100000-0000-4000-8000-000000000003'
    );
    delete from public.order_delivery_reconciliation
    where order_id in (
      '86100000-0000-4000-8000-000000000001',
      '86100000-0000-4000-8000-000000000002',
      '86100000-0000-4000-8000-000000000003'
    );
    delete from public.orders
    where id in (
      '86100000-0000-4000-8000-000000000001',
      '86100000-0000-4000-8000-000000000002',
      '86100000-0000-4000-8000-000000000003'
    );
    delete from public.lunch_days
    where id in (
      '86200000-0000-4000-8000-000000000001',
      '86200000-0000-4000-8000-000000000002',
      '86200000-0000-4000-8000-000000000003'
    );
    delete from public.lunch_providers
    where id = '86300000-0000-4000-8000-000000000001';
    select set_config('app.allow_lunch_period_write', 'true', true);
    delete from public.lunch_periods
    where id in (
      '86500000-0000-4000-8000-000000000001',
      '86500000-0000-4000-8000-000000000002',
      '86500000-0000-4000-8000-000000000003'
    );
    select set_config('app.allow_lunch_period_write', '', true);
    delete from auth.users
    where id in (
      '86400000-0000-4000-8000-000000000001',
      '86400000-0000-4000-8000-000000000002',
      '86400000-0000-4000-8000-000000000003'
    );

    insert into auth.users (id, email, raw_user_meta_data)
    values
      ('86400000-0000-4000-8000-000000000001', 'bug8-concurrency-staff@test.local', '{"full_name":"Bug Eight Concurrent Staff"}'),
      ('86400000-0000-4000-8000-000000000002', 'bug8-concurrency-hr@test.local', '{"full_name":"Bug Eight Concurrent HR"}'),
      ('86400000-0000-4000-8000-000000000003', 'bug8-concurrency-accounts@test.local', '{"full_name":"Bug Eight Concurrent Accounts"}');

    select private.apply_profile_role('86400000-0000-4000-8000-000000000002', 'hr');
    select private.apply_profile_role('86400000-0000-4000-8000-000000000003', 'accounts');

    insert into public.lunch_providers (id, name, active, primary_order_email)
    values (
      '86300000-0000-4000-8000-000000000001',
      'Bug Eight Concurrency Provider',
      true,
      'bug8-concurrency-provider@example.test'
    );

    select set_config('app.allow_lunch_period_write', 'true', true);
    insert into public.lunch_periods (id, label, start_date, end_date, is_current)
    values
      ('86500000-0000-4000-8000-000000000001', 'Issue First', '2020-01-01', '2020-01-31', false),
      ('86500000-0000-4000-8000-000000000002', 'Finalize First', '2020-02-01', '2020-02-29', false),
      ('86500000-0000-4000-8000-000000000003', 'Unrelated Period', '2020-03-01', '2020-03-31', false);
    select set_config('app.allow_lunch_period_write', '', true);

    insert into public.lunch_days (
      id, lunch_date, order_date, provider_id, order_deadline, status
    )
    values
      ('86200000-0000-4000-8000-000000000001', '2020-01-08', '2020-01-06', '86300000-0000-4000-8000-000000000001', '2020-01-06 16:00:00+00', 'open'),
      ('86200000-0000-4000-8000-000000000002', '2020-02-12', '2020-02-10', '86300000-0000-4000-8000-000000000001', '2020-02-10 16:00:00+00', 'open'),
      ('86200000-0000-4000-8000-000000000003', '2020-03-11', '2020-03-09', '86300000-0000-4000-8000-000000000001', '2020-03-09 16:00:00+00', 'open');

    select private.activate_bypass_order_deadline();

    insert into public.orders (
      id, profile_id, lunch_day_id, status, delivery_state,
      financial_disposition, office_location_name
    )
    values
      ('86100000-0000-4000-8000-000000000001', '86400000-0000-4000-8000-000000000001', '86200000-0000-4000-8000-000000000001', 'fulfilled', 'delivered', 'chargeable', 'Kingston'),
      ('86100000-0000-4000-8000-000000000002', '86400000-0000-4000-8000-000000000001', '86200000-0000-4000-8000-000000000002', 'fulfilled', 'delivered', 'chargeable', 'Kingston'),
      ('86100000-0000-4000-8000-000000000003', '86400000-0000-4000-8000-000000000001', '86200000-0000-4000-8000-000000000003', 'fulfilled', 'delivered', 'chargeable', 'Kingston');
  $setup$
);

select extensions.dblink_exec(
  'bug8_hr',
  $$
    set request.jwt.claims =
      '{"sub":"86400000-0000-4000-8000-000000000002","role":"authenticated"}';

    create or replace function pg_temp.report_issue_and_hold(
      p_order_id uuid,
      p_ready_key bigint,
      p_release_key bigint
    )
    returns text
    language plpgsql
    as $function$
    begin
      perform public.report_order_delivery_issue(p_order_id, 'not_delivered');
      perform pg_advisory_xact_lock(p_ready_key);
      perform pg_advisory_xact_lock(p_release_key);
      return 'issue committed';
    end;
    $function$;

    create or replace function pg_temp.report_issue_expect_finalized(p_order_id uuid)
    returns text
    language plpgsql
    as $function$
    begin
      perform public.report_order_delivery_issue(p_order_id, 'not_delivered');
      return 'unexpected success';
    exception
      when others then
        if sqlerrm <> 'Orders in finalized lunch periods cannot be modified' then
          raise;
        end if;
        return 'finalized period rejected';
    end;
    $function$;

    create or replace function pg_temp.resolve_no_charge(p_order_id uuid)
    returns text
    language plpgsql
    as $function$
    begin
      perform public.resolve_order_no_charge(p_order_id);
      return 'blocker reconciled';
    end;
    $function$;

    create or replace function pg_temp.report_issue_now(p_order_id uuid)
    returns text
    language plpgsql
    as $function$
    begin
      perform public.report_order_delivery_issue(p_order_id, 'not_delivered');
      return 'issue committed';
    end;
    $function$;
  $$
);

select extensions.dblink_exec(
  'bug8_accounts',
  $$
    set request.jwt.claims =
      '{"sub":"86400000-0000-4000-8000-000000000003","role":"authenticated"}';

    create or replace function pg_temp.finalize_expect_blocked(p_period_id uuid)
    returns text
    language plpgsql
    as $function$
    begin
      perform public.finalize_lunch_period(p_period_id);
      return 'unexpected success';
    exception
      when others then
        if sqlerrm not like 'This lunch period cannot be finalized because % order(s) still require delivery reconciliation.' then
          raise;
        end if;
        return 'blocker refused finalization';
    end;
    $function$;

    create or replace function pg_temp.finalize_and_hold(
      p_period_id uuid,
      p_ready_key bigint,
      p_release_key bigint
    )
    returns text
    language plpgsql
    as $function$
    begin
      perform public.finalize_lunch_period(p_period_id);
      perform pg_advisory_xact_lock(p_ready_key);
      perform pg_advisory_xact_lock(p_release_key);
      return 'period finalized';
    end;
    $function$;

    create or replace function pg_temp.finalize_now(p_period_id uuid)
    returns text
    language plpgsql
    as $function$
    begin
      perform public.finalize_lunch_period(p_period_id);
      return 'period finalized';
    end;
    $function$;
  $$
);

-- HR gets the period lock first. Accounts must wait, then see HR's committed blocker.
select pg_advisory_lock(73202714002);
select ok(
  extensions.dblink_send_query(
    'bug8_hr',
    $$ select pg_temp.report_issue_and_hold(
      '86100000-0000-4000-8000-000000000001', 73202714001, 73202714002
    ) $$
  ) = 1,
  'HR starts issue reporting in an independent transaction'
);
select ok(
  pg_temp.wait_for_advisory_lock(73202714001),
  'HR holds the financial-period row lock before finalization starts'
);
select ok(
  extensions.dblink_send_query(
    'bug8_accounts',
    $$ select pg_temp.finalize_expect_blocked(
      '86500000-0000-4000-8000-000000000001'
    ) $$
  ) = 1,
  'Accounts starts finalization in a second independent transaction'
);
select pg_sleep(0.1);
select is(
  extensions.dblink_is_busy('bug8_accounts'),
  1,
  'Accounts waits on the same period lock while HR issue reporting is in flight'
);
select ok(pg_advisory_unlock(73202714002), 'HR issue-reporting barrier is released');
select ok(pg_temp.wait_for_dblink('bug8_hr'), 'HR issue reporting completes without deadlock');
select ok(pg_temp.wait_for_dblink('bug8_accounts'), 'Accounts finalization completes without deadlock');
select is(
  (select result from extensions.dblink_get_result('bug8_hr') as t(result text)),
  'issue committed',
  'HR issue reporting commits before finalization rechecks blockers'
);
select is(
  (select result from extensions.dblink_get_result('bug8_accounts') as t(result text)),
  'blocker refused finalization',
  'finalization refuses the blocker committed by the lock holder'
);
select count(*)
from extensions.dblink_get_result('bug8_hr') as drained(result text);
select count(*)
from extensions.dblink_get_result('bug8_accounts') as drained(result text);
select results_eq(
  $$
    select lp.status, private.count_unreconciled_delivery_orders(lp.id)
    from public.lunch_periods lp
    where lp.id = '86500000-0000-4000-8000-000000000001'
  $$,
  $$ values ('open'::text, 1::bigint) $$,
  'HR-first overlap cannot produce a finalized period with a blocker'
);

-- Normal reconciliation clears the blocker and normal finalization remains available.
select is(
  (
    select result
    from extensions.dblink(
      'bug8_hr',
      $$ select pg_temp.resolve_no_charge(
        '86100000-0000-4000-8000-000000000001'
      ) $$
    ) as t(result text)
  ),
  'blocker reconciled',
  'permanent HR can reconcile the blocker normally'
);
select is(
  (
    select result
    from extensions.dblink(
      'bug8_accounts',
      $$ select pg_temp.finalize_now(
        '86500000-0000-4000-8000-000000000001'
      ) $$
    ) as t(result text)
  ),
  'period finalized',
  'Accounts can finalize normally after reconciliation'
);

-- Accounts gets the period lock first. An unrelated period remains independent,
-- while a blocker write for the finalized period waits and is then rejected.
select pg_advisory_lock(73202714004);
select ok(
  extensions.dblink_send_query(
    'bug8_accounts',
    $$ select pg_temp.finalize_and_hold(
      '86500000-0000-4000-8000-000000000002', 73202714003, 73202714004
    ) $$
  ) = 1,
  'Accounts starts finalization while retaining its period lock'
);
select ok(
  pg_temp.wait_for_advisory_lock(73202714003),
  'Accounts holds the finalized period lock before HR starts'
);
select is(
  (
    select result
    from extensions.dblink(
      'bug8_hr',
      $$ select pg_temp.report_issue_now(
        '86100000-0000-4000-8000-000000000003'
      ) $$
    ) as t(result text)
  ),
  'issue committed',
  'a mutation in an unrelated financial period is not serialized behind finalization'
);
select ok(
  extensions.dblink_send_query(
    'bug8_hr',
    $$ select pg_temp.report_issue_expect_finalized(
      '86100000-0000-4000-8000-000000000002'
    ) $$
  ) = 1,
  'HR starts a blocker-creating mutation against the period being finalized'
);
select pg_sleep(0.1);
select is(
  extensions.dblink_is_busy('bug8_hr'),
  1,
  'HR waits for the in-flight finalization period lock'
);
select ok(pg_advisory_unlock(73202714004), 'Accounts finalization barrier is released');
select ok(pg_temp.wait_for_dblink('bug8_accounts'), 'Accounts finalization commits without deadlock');
select ok(pg_temp.wait_for_dblink('bug8_hr'), 'HR mutation completes without deadlock');
select is(
  (select result from extensions.dblink_get_result('bug8_accounts') as t(result text)),
  'period finalized',
  'Accounts commits finalization while it owns the period lock'
);
select is(
  (select result from extensions.dblink_get_result('bug8_hr') as t(result text)),
  'finalized period rejected',
  'the later HR mutation rechecks status and cannot add a blocker'
);
select count(*)
from extensions.dblink_get_result('bug8_accounts') as drained(result text);
select count(*)
from extensions.dblink_get_result('bug8_hr') as drained(result text);
select results_eq(
  $$
    select lp.status, private.count_unreconciled_delivery_orders(lp.id),
           o.delivery_state, o.financial_disposition
    from public.lunch_periods lp
    join public.orders o on o.id = '86100000-0000-4000-8000-000000000002'
    where lp.id = '86500000-0000-4000-8000-000000000002'
  $$,
  $$ values ('finalized'::text, 0::bigint, 'delivered'::text, 'chargeable'::text) $$,
  'finalize-first overlap cannot leave a blocker in the finalized period'
);

select throws_ok(
  $$
    update public.orders
    set delivery_state = 'pending', status = 'submitted'
    where id = '86100000-0000-4000-8000-000000000002'
  $$,
  'P0001',
  'Orders in finalized lunch periods cannot be modified',
  'direct blocker-reintroducing updates are rejected after finalization'
);

select throws_ok(
  $$
    insert into public.orders (
      profile_id, lunch_day_id, status, delivery_state,
      financial_disposition, office_location_name
    )
    values (
      '86400000-0000-4000-8000-000000000001',
      '86200000-0000-4000-8000-000000000002',
      'submitted', 'pending', 'chargeable', 'Kingston'
    )
  $$,
  'P0001',
  'Orders in finalized lunch periods cannot be modified',
  'new order insertion cannot introduce a blocker into a finalized period'
);

select throws_ok(
  $$
    update public.lunch_days
    set order_date = '2020-02-20'
    where id = '86200000-0000-4000-8000-000000000003'
  $$,
  'P0001',
  'Orders in finalized lunch periods cannot be modified',
  'a lunch-day date change cannot move an existing blocker into a finalized period'
);

select extensions.dblink_disconnect('bug8_hr');
select is(
  extensions.dblink_exec(
    'bug8_accounts',
    $cleanup$
      delete from public.order_delivery_events
      where order_id in (
        '86100000-0000-4000-8000-000000000001',
        '86100000-0000-4000-8000-000000000002',
        '86100000-0000-4000-8000-000000000003'
      );
      delete from public.order_delivery_reconciliation
      where order_id in (
        '86100000-0000-4000-8000-000000000001',
        '86100000-0000-4000-8000-000000000002',
        '86100000-0000-4000-8000-000000000003'
      );
      delete from public.orders
      where id in (
        '86100000-0000-4000-8000-000000000001',
        '86100000-0000-4000-8000-000000000002',
        '86100000-0000-4000-8000-000000000003'
      );
      delete from public.lunch_days
      where id in (
        '86200000-0000-4000-8000-000000000001',
        '86200000-0000-4000-8000-000000000002',
        '86200000-0000-4000-8000-000000000003'
      );
      delete from public.lunch_providers
      where id = '86300000-0000-4000-8000-000000000001';
      select set_config('app.allow_lunch_period_write', 'true', true);
      delete from public.lunch_periods
      where id in (
        '86500000-0000-4000-8000-000000000001',
        '86500000-0000-4000-8000-000000000002',
        '86500000-0000-4000-8000-000000000003'
      );
      select set_config('app.allow_lunch_period_write', '', true);
      delete from auth.users
      where id in (
        '86400000-0000-4000-8000-000000000001',
        '86400000-0000-4000-8000-000000000002',
        '86400000-0000-4000-8000-000000000003'
      );
    $cleanup$
  ),
  'DELETE 3',
  'all concurrency fixtures are removed from the disposable local database'
);
select extensions.dblink_disconnect('bug8_accounts');

select * from finish();
rollback;
