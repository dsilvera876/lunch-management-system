begin;

select plan(12);

\ir support/isolate_lunch_periods.inc
\ir support/pgtap_test_session.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e1111111-1111-4111-8111-111111111111', 'elig-staff@test.local', '{"full_name":"Elig Staff"}'),
  ('e4444444-4444-4444-8444-444444444444', 'elig-accounts@test.local', '{"full_name":"Elig Accounts"}');

reset role;

select private.apply_profile_role('e4444444-4444-4444-8444-444444444444', 'accounts');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select public.create_first_lunch_period('Elig Past', '2099-04-01', '2099-04-10');
select public.create_next_lunch_period('Elig Today', '2099-05-15');
select public.create_next_lunch_period('Elig Future', '2099-06-30');

reset role;

\ir support/reconcile_lunch_period_orders.inc

select pg_temp.reconcile_lunch_period_orders_by_label('Elig Past');
select pg_temp.reconcile_lunch_period_orders_by_label('Elig Today');
select pg_temp.reconcile_lunch_period_orders_by_label('Elig Future');

-- ============================================================
-- End date vs Jamaica today
-- ============================================================

select set_config('test.jamaica_today', '2099-05-15', true);
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Today')) $$,
  'P0001',
  'This lunch period cannot be finalized until it has ended.',
  'Period ending on Jamaica today cannot be finalized'
);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Future')) $$,
  'P0001',
  'This lunch period cannot be finalized until it has ended.',
  'Period ending after Jamaica today cannot be finalized'
);

select results_eq(
  $$
    select status
    from public.lunch_periods
    where label in ('Elig Today', 'Elig Future')
    order by label
  $$,
  $$ values ('open'::text), ('open'::text) $$,
  'Blocked finalization leaves periods open'
);

-- ============================================================
-- Staff ordering not closed by a failed finalize attempt
-- ============================================================

select set_config('test.jamaica_today', '2099-05-01', true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Future')) $$,
  'P0001',
  'This lunch period cannot be finalized until it has ended.',
  'Premature finalize attempt is rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  public.is_order_date_in_finalized_period('2099-06-15'::date),
  false,
  'Staff order dates stay available after invalid finalization attempt'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select set_config('test.jamaica_today', '2099-05-16', true);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Today')) $$,
  'Period ending yesterday (relative to Jamaica today) can be finalized'
);

select set_config('test.jamaica_today', '2099-12-31', true);

-- ============================================================
-- Authorization unchanged
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Past')) $$,
  'P0001',
  'Lunch period finalization access required',
  'Staff cannot finalize even when period end has passed'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Past')) $$,
  'Period ending well before Jamaica today can be finalized'
);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Future')) $$,
  'Future-ended period can be finalized once Jamaica today is past end date'
);

-- ============================================================
-- Reopening restores staff ordering for in-period dates
-- ============================================================

select set_config('test.jamaica_today', '2099-06-15', true);

select is(
  public.is_order_date_in_finalized_period('2099-06-15'::date),
  true,
  'Order date in finalized period is blocked before reopen'
);

select set_config('app.allow_lunch_period_write', 'true', true);

update public.lunch_periods
set
  status = 'open',
  finalized_daily_subsidy = null,
  updated_by = 'e4444444-4444-4444-8444-444444444444'::uuid
where label = 'Elig Future'
  and status = 'finalized';

select set_config('app.allow_lunch_period_write', '', true);

select is(
  public.is_order_date_in_finalized_period('2099-06-15'::date),
  false,
  'Reopening the lunch period restores ordering for dates within the period'
);

-- ============================================================
-- Already-finalized behavior
-- ============================================================

select set_config('test.jamaica_today', '2099-12-31', true);
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Elig Past')) $$,
  'P0001',
  'Only open lunch periods can be finalized',
  'Already-finalized period cannot be finalized again'
);

select * from finish();

rollback;
