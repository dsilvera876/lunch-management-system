begin;

select plan(33);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

-- Fixture dates use January 2099 so tests do not depend on the real calendar month.

-- ============================================================
-- Users and roles
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e1111111-1111-4111-8111-111111111111', 'sub-staff1@test.local', '{"full_name":"Sub Staff One"}'),
  ('e2222222-2222-4222-8222-222222222222', 'sub-staff2@test.local', '{"full_name":"Sub Staff Two"}'),
  ('e3333333-3333-4333-8333-333333333333', 'sub-hr@test.local', '{"full_name":"Sub HR"}'),
  ('e4444444-4444-4444-8444-444444444444', 'sub-accounts@test.local', '{"full_name":"Sub Accounts"}'),
  ('e5555555-5555-4555-8555-555555555555', 'sub-admin@test.local', '{"full_name":"Sub Admin"}'),
  ('e6666666-6666-4666-8666-666666666666', 'sub-owner@test.local', '{"full_name":"Sub Owner"}');

reset role;

select private.apply_profile_role('e3333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('e4444444-4444-4444-8444-444444444444', 'accounts');
select private.apply_profile_role('e5555555-5555-4555-8555-555555555555', 'admin');
select private.apply_profile_role('e6666666-6666-4666-8666-666666666666', 'owner');

-- ============================================================
-- Providers, menus, period
-- ============================================================

insert into public.lunch_providers (id, name, active)
values
  ('f1111111-1111-4111-8111-111111111111', 'Subsidy Kitchen A', true),
  ('f2222222-2222-4222-8222-222222222222', 'Subsidy Kitchen B', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('01111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'Meal 700', 700.00, 'standalone', 'Each', true),
  ('02222222-2222-4222-8222-222222222222', 'f1111111-1111-4111-8111-111111111111', 'Meal 400', 400.00, 'standalone', 'Each', true),
  ('03333333-3333-4333-8333-333333333333', 'f1111111-1111-4111-8111-111111111111', 'Meal 300', 300.00, 'standalone', 'Each', true),
  ('04444444-4444-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', 'Meal 500', 500.00, 'standalone', 'Each', true),
  ('05555555-5555-4555-8555-555555555555', 'f1111111-1111-4111-8111-111111111111', 'Meal 800', 800.00, 'standalone', 'Each', true),
  ('06666666-6666-4666-8666-666666666666', 'f2222222-2222-4222-8222-222222222222', 'Meal 200', 200.00, 'standalone', 'Each', true),
  ('07777777-7777-4777-8777-777777777777', 'f1111111-1111-4111-8111-111111111111', 'Meal 12', 12.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select id, wd
from public.provider_menu_items
cross join generate_series(1, 5) as wd
where provider_id in (
  'f1111111-1111-4111-8111-111111111111',
  'f2222222-2222-4222-8222-222222222222'
);

update public.app_settings
set
  order_cutoff_time = '23:59:00',
  daily_lunch_subsidy = 0
where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select public.create_first_lunch_period('Subsidy Payroll', '2099-01-01', '2099-01-31');
select public.create_next_lunch_period('October Payroll', '2099-02-28');

select public.set_current_lunch_period(id)
from public.lunch_periods
where label = 'Subsidy Payroll';

-- ============================================================
-- Default and authorization
-- ============================================================

reset role;

select results_eq(
  $$ select public.get_daily_lunch_subsidy() $$,
  array[0::numeric],
  'Global daily lunch subsidy defaults to zero'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_daily_lunch_subsidy(-1::numeric) $$,
  'P0001',
  'Daily lunch subsidy must be zero or greater',
  'Negative daily lunch subsidy is rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_daily_lunch_subsidy(500::numeric) $$,
  'P0001',
  'Daily lunch subsidy update access required',
  'Staff cannot change daily lunch subsidy'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_daily_lunch_subsidy(500::numeric) $$,
  'P0001',
  'Daily lunch subsidy update access required',
  'HR cannot change daily lunch subsidy'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_daily_lunch_subsidy(500::numeric) $$,
  'Accounts can change daily lunch subsidy'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_daily_lunch_subsidy(500::numeric) $$,
  'Admin can change daily lunch subsidy'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_daily_lunch_subsidy(500::numeric) $$,
  'Owner can change daily lunch subsidy'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.get_daily_lunch_subsidy() $$,
  array[500::numeric],
  'Staff can read daily lunch subsidy'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.get_daily_lunch_subsidy() $$,
  array[500::numeric],
  'HR can read daily lunch subsidy'
);

-- ============================================================
-- Order fixtures for subsidy calculations
-- ============================================================

\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- No orders yet for staff2 (subsidy used should stay zero)

-- Sep 11: 700 + 400 + 200 across providers same day
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"01111111-1111-4111-8111-111111111111","quantity":1}]}'::jsonb,
  null
);
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"02222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
  null
);
select public.submit_provider_order(
  'f2222222-2222-4222-8222-222222222222',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"06666666-6666-4666-8666-666666666666","quantity":1}]}'::jsonb,
  null
);

-- Sep 14: spend below subsidy (300)
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-12'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"03333333-3333-4333-8333-333333333333","quantity":1}]}'::jsonb,
  null
);

-- Sep 15: spend equal subsidy (500)
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-13'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"04444444-4444-4444-8444-444444444444","quantity":1}]}'::jsonb,
  null
);

-- Sep 16: spend above subsidy (800)
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-14'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"05555555-5555-4555-8555-555555555555","quantity":1}]}'::jsonb,
  null
);

-- Sep 17: quantity > 1 (24.00) and cancelled duplicate
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-15'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"07777777-7777-4777-8777-777777777777","quantity":2}]}'::jsonb,
  null
);
select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-01-15'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"07777777-7777-4777-8777-777777777777","quantity":1}]}'::jsonb,
  null
);

select public.cancel_order(o.id)
from public.orders o
join public.lunch_days ld on ld.id = o.lunch_day_id
where o.profile_id = 'e1111111-1111-4111-8111-111111111111'
  and ld.order_date = '2099-01-15'::date
  and o.status = 'submitted'
  and public.calculate_order_total(o.id) = 12.00
limit 1;

reset role;

update public.orders
set status = 'fulfilled'
where profile_id = 'e1111111-1111-4111-8111-111111111111'
  and lunch_day_id in (
    select id from public.lunch_days where order_date = '2099-01-13'::date
  );

-- ============================================================
-- Core subsidy calculations
-- ============================================================

reset role;

select results_eq(
  $$
    select s.subsidy_used
    from private.financial_subsidy_summary(
      'e2222222-2222-4222-8222-222222222222',
      '2099-01-01'::date,
      '2099-01-31'::date,
      (select id from public.lunch_periods where label = 'Subsidy Payroll'),
      500::numeric
    ) s
  $$,
  array[0::numeric],
  'No qualifying orders means zero subsidy used'
);

select results_eq(
  $$ select s.subsidy_used, s.net_deduction from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-12'::date,
      '2099-01-12'::date,
      null,
      500::numeric
    ) s $$,
  $$ values (300::numeric, 0::numeric) $$,
  'Spend below subsidy limits subsidy used to daily spend'
);

select results_eq(
  $$ select s.subsidy_used, s.net_deduction from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-13'::date,
      '2099-01-13'::date,
      null,
      500::numeric
    ) s $$,
  $$ values (500::numeric, 0::numeric) $$,
  'Spend equal to subsidy produces zero net deduction'
);

select results_eq(
  $$ select s.subsidy_used, s.net_deduction from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-14'::date,
      '2099-01-14'::date,
      null,
      500::numeric
    ) s $$,
  $$ values (500::numeric, 300::numeric) $$,
  'Spend above subsidy produces correct net deduction'
);

select results_eq(
  $$ select s.gross_total, s.subsidy_used, s.net_deduction from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-09'::date,
      '2099-01-09'::date,
      null,
      500::numeric
    ) s $$,
  $$ values (1300::numeric, 500::numeric, 800::numeric) $$,
  'Multiple orders on the same order date receive subsidy once'
);

select results_eq(
  $$
    select count(*)::bigint
    from private.employee_daily_gross_spend(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-09'::date,
      '2099-01-09'::date,
      null
    ) d
  $$,
  array[1::bigint],
  'Multiple providers on the same order date combine into one daily gross'
);

select results_eq(
  $$
    select s.gross_total
    from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-15'::date,
      '2099-01-15'::date,
      null,
      500::numeric
    ) s
  $$,
  array[24.00::numeric],
  'Quantity greater than one is included in daily gross'
);

select results_eq(
  $$ select s.gross_total, s.subsidy_used from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-15'::date,
      '2099-01-15'::date,
      null,
      500::numeric
    ) s $$,
  $$ values (24.00::numeric, 24.00::numeric) $$,
  'Cancelled orders are excluded before subsidy calculation'
);

select results_eq(
  $$
    select s.gross_total
    from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-13'::date,
      '2099-01-13'::date,
      null,
      500::numeric
    ) s
  $$,
  array[500::numeric],
  'Fulfilled orders are included in subsidy calculations'
);

select results_eq(
  $$
    select s.subsidy_used
    from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-09'::date,
      '2099-01-12'::date,
      null,
      500::numeric
    ) s
  $$,
  array[800::numeric],
  'Different order dates each receive subsidy separately'
);

select results_eq(
  $$
    select s.subsidy_used
    from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-01'::date,
      '2099-01-31'::date,
      (select id from public.lunch_periods where label = 'Subsidy Payroll'),
      500::numeric
    ) s
  $$,
  array[1824::numeric],
  'Unused subsidy does not roll over across order dates'
);

-- Period gross 1300+300+500+800+24 = 2924; subsidy 500*4 days with spend on 11,12,13,14,15 = 500*5? 
-- Days: 11(500), 12(300), 13(500), 14(500), 15(24) = 1824 subsidy used

select results_eq(
  $$ select s.gross_total, s.subsidy_used, s.net_deduction from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      null,
      null,
      (select id from public.lunch_periods where label = 'Subsidy Payroll'),
      500::numeric
    ) s $$,
  $$ values (2924::numeric, 1824::numeric, 1100::numeric) $$,
  'Period gross, subsidy used, and net deduction are correct'
);

select results_eq(
  $$ select s.gross_total, s.subsidy_used, s.net_deduction from private.financial_subsidy_summary(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-01'::date,
      '2099-01-31'::date,
      null,
      500::numeric
    ) s $$,
  $$ values (2924::numeric, 1824::numeric, 1100::numeric) $$,
  'Calendar-month gross, subsidy used, and net deduction are correct'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select jsonb_array_length(
      public.get_my_financial_dashboard() -> 'recent_months'
    )::int
  $$,
  array[3],
  'Recent months view still includes three months'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'Subsidy Payroll')
    ) -> 'employees' -> 0 ->> 'net_deduction')::numeric
  $$,
  array[1100::numeric],
  'Management employee subsidy totals are correct'
);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'Subsidy Payroll')
    ) ->> 'grand_net_deduction')::numeric
  $$,
  array[1100::numeric],
  'Overall period net deduction total is correct'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select (public.get_my_lunch_period_export_data() ->> 'net_deduction')::numeric
  $$,
  array[1100::numeric],
  'Staff export net deduction matches authoritative summary'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select (public.get_lunch_period_export_data(
      (select id from public.lunch_periods where label = 'Subsidy Payroll')
    ) ->> 'grand_subsidy_used')::numeric
  $$,
  array[1824::numeric],
  'Management export subsidy total matches authoritative summary'
);

-- ============================================================
-- Finalized-period subsidy snapshot
-- ============================================================

\ir support/reconcile_lunch_period_orders.inc

select pg_temp.reconcile_lunch_period_orders_by_label('Subsidy Payroll');

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Subsidy Payroll')) $$,
  'Finalized period snapshots current global subsidy'
);

select results_eq(
  $$
    select finalized_daily_subsidy
    from public.lunch_periods
    where label = 'Subsidy Payroll'
  $$,
  array[500::numeric],
  'Finalized period stores the global subsidy at finalization'
);

select lives_ok(
  $$ select public.update_daily_lunch_subsidy(900::numeric) $$,
  'Global subsidy can change after finalization'
);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'Subsidy Payroll')
    ) ->> 'grand_subsidy_used')::numeric
  $$,
  array[1824::numeric],
  'Changing global subsidy afterward does not alter finalized totals'
);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'October Payroll')
    ) ->> 'daily_lunch_subsidy')::numeric
  $$,
  array[900::numeric],
  'Open period reflects current global subsidy changes'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.financial_total_for_profile('e2222222-2222-4222-8222-222222222222', '2099-01-01'::date, '2099-01-31'::date) $$,
  'P0001',
  'Not authorized to view financial summaries for this employee',
  'Staff cannot query another employee financial data'
);

select * from finish();
rollback;
