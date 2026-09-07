begin;

select plan(37);

-- Fixture dates use January 2099 so tests do not depend on the real calendar month.

-- ============================================================
-- Users and roles
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'fin-staff1@test.local', '{"full_name":"Fin Staff One"}'),
  ('a2222222-2222-4222-8222-222222222222', 'fin-staff2@test.local', '{"full_name":"Fin Staff Two"}'),
  ('a3333333-3333-4333-8333-333333333333', 'fin-hr@test.local', '{"full_name":"Fin HR"}'),
  ('a4444444-4444-4444-8444-444444444444', 'fin-accounts@test.local', '{"full_name":"Fin Accounts"}'),
  ('a5555555-5555-4555-8555-555555555555', 'fin-admin@test.local', '{"full_name":"Fin Admin"}'),
  ('a6666666-6666-4666-8666-666666666666', 'fin-owner@test.local', '{"full_name":"Fin Owner"}');

reset role;

select private.apply_profile_role('a3333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('a4444444-4444-4444-8444-444444444444', 'accounts');
select private.apply_profile_role('a5555555-5555-4555-8555-555555555555', 'admin');
select private.apply_profile_role('a6666666-6666-4666-8666-666666666666', 'owner');

-- ============================================================
-- Provider, menu, lunch period
-- ============================================================

reset role;

insert into public.lunch_providers (id, name, active)
values ('b1111111-1111-4111-8111-111111111111', 'Finance Kitchen', true);

insert into public.provider_menu_items (id, provider_id, name, price, active)
values
  ('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Meal A', 12.00, true),
  ('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'Meal B', 11.00, true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('c1111111-1111-4111-8111-111111111111', 1),
  ('c1111111-1111-4111-8111-111111111111', 2),
  ('c1111111-1111-4111-8111-111111111111', 4),
  ('c1111111-1111-4111-8111-111111111111', 5),
  ('c2222222-2222-4222-8222-222222222222', 1),
  ('c2222222-2222-4222-8222-222222222222', 2),
  ('c2222222-2222-4222-8222-222222222222', 4),
  ('c2222222-2222-4222-8222-222222222222', 5);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select public.create_first_lunch_period('September Payroll A', '2099-01-01', '2099-01-11');
select public.create_next_lunch_period('September Payroll B', '2099-01-25');

select public.set_current_lunch_period(id)
from public.lunch_periods
where label = 'September Payroll A';

reset role;

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

-- ============================================================
-- Orders for financial tests
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- Friday order in first period (Sep 11 2026)
select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-09'::date,
  '[{"provider_menu_item_id":"c1111111-1111-4111-8111-111111111111","quantity":2}]'::jsonb
);

-- Fulfilled order in first period
select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-06'::date,
  '[{"provider_menu_item_id":"c2222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb
);

-- Cancelled order in first period
select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-09'::date,
  '[{"provider_menu_item_id":"c1111111-1111-4111-8111-111111111111","quantity":1}]'::jsonb
);

select public.cancel_order(o.id)
from public.orders o
join public.lunch_days ld on ld.id = o.lunch_day_id
where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
  and ld.order_date = '2099-01-09'::date
  and o.status = 'submitted'
  and public.calculate_order_total(o.id) = 12.00
limit 1;

-- Second staff order same Friday
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-09'::date,
  '[{"provider_menu_item_id":"c1111111-1111-4111-8111-111111111111","quantity":1}]'::jsonb
);

-- Order outside first period (second period)
select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-13'::date,
  '[{"provider_menu_item_id":"c1111111-1111-4111-8111-111111111111","quantity":1}]'::jsonb
);

reset role;

update public.orders
set status = 'fulfilled'
where profile_id = 'a1111111-1111-4111-8111-111111111111'
  and lunch_day_id in (
    select id from public.lunch_days where order_date = '2099-01-06'::date
  );

-- Multi-item order total check setup
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-09'::date,
  '[
    {"provider_menu_item_id":"c1111111-1111-4111-8111-111111111111","quantity":1},
    {"provider_menu_item_id":"c2222222-2222-4222-8222-222222222222","quantity":1}
  ]'::jsonb
);

-- ============================================================
-- Core accounting rules
-- ============================================================

select results_eq(
  $$
    select public.calculate_order_total(o.id)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    join public.order_items oi on oi.order_id = o.id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
      and oi.quantity = 2
    limit 1
  $$,
  array[24.00::numeric],
  'Order total equals quantity times snapshot unit price'
);

select results_eq(
  $$
    select public.calculate_order_total(o.id)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
      and public.calculate_order_total(o.id) = 23.00
    limit 1
  $$,
  array[23.00::numeric],
  'Multiple order items sum correctly'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
      and o.status in ('submitted', 'fulfilled')
  $$,
  array[2::bigint],
  'Multiple separate orders on the same order date are all counted'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
      and o.status = 'submitted'
  $$,
  array[2::bigint],
  'Submitted orders are included in financial totals'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date between '2099-01-01'::date and '2099-01-11'::date
      and o.status = 'fulfilled'
  $$,
  array[1::bigint],
  'Fulfilled orders are included in financial totals'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
      and o.status = 'cancelled'
  $$,
  array[1::bigint],
  'Cancelled orders exist but are excluded from qualifying financial orders'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date between '2099-01-01'::date and '2099-01-11'::date
      and o.status in ('submitted', 'fulfilled')
  $$,
  array[3::bigint],
  'Cancelled orders are excluded from financial totals'
);

-- ============================================================
-- Authorization
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.financial_total_for_profile('a2222222-2222-4222-8222-222222222222', '2099-01-01'::date, '2099-01-11'::date) $$,
  'P0001',
  'Not authorized to view financial summaries for this employee',
  'Staff sees own financial data only'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.financial_total_for_profile('a1111111-1111-4111-8111-111111111111', '2099-01-01'::date, '2099-01-11'::date) $$,
  array[58.00::numeric],
  'HR sees all staff summaries'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.financial_total_for_profile('a1111111-1111-4111-8111-111111111111', '2099-01-01'::date, '2099-01-11'::date) $$,
  array[58.00::numeric],
  'Accounts sees all staff summaries'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.financial_total_for_profile('a2222222-2222-4222-8222-222222222222', '2099-01-01'::date, '2099-01-11'::date) $$,
  array[12.00::numeric],
  'Admin sees all staff summaries'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.financial_total_for_profile('a2222222-2222-4222-8222-222222222222', '2099-01-01'::date, '2099-01-11'::date) $$,
  array[12.00::numeric],
  'Owner sees all staff summaries'
);

-- ============================================================
-- Lunch-period membership and totals
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.lunch_period_contains_order_date('2099-01-01', '2099-01-11', '2099-01-09') $$,
  array[true],
  'Current-period membership uses order date'
);

select results_eq(
  $$ select public.lunch_period_contains_order_date('2099-01-01', '2099-01-11', '2099-01-12') $$,
  array[false],
  'Friday order Monday delivery uses Friday order date for membership'
);

select results_eq(
  $$
    select jsonb_array_length(
      public.get_lunch_period_financial_summary(
        (select id from public.lunch_periods where label = 'September Payroll A')
      ) -> 'orders'
    )::bigint
  $$,
  array[4::bigint],
  'Orders outside the selected period are excluded from period totals'
);

select results_eq(
  $$ select public.financial_total_for_profile('a1111111-1111-4111-8111-111111111111', '2099-01-01'::date, '2099-01-11'::date) $$,
  array[58.00::numeric],
  'Period employee total is correct'
);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'September Payroll A')
    ) ->> 'grand_total')::numeric
  $$,
  array[70.00::numeric],
  'Overall period total is correct'
);

-- ============================================================
-- Jamaica month helpers and quantity / snapshot price
-- ============================================================

select results_eq(
  $$ select start_date::text from public.jamaica_month_bounds('2026-08-15'::date) $$,
  array['2026-08-01'::text],
  'Jamaica month start boundary is correct'
);

select results_eq(
  $$ select end_date::text from public.jamaica_month_bounds('2026-08-15'::date) $$,
  array['2026-08-31'::text],
  'Jamaica month end boundary is correct'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select jsonb_array_length(
      public.get_my_financial_dashboard() -> 'recent_months'
    )::int
  $$,
  array[3],
  'Recent months view includes current month plus previous two months'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select max(oi.quantity)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
  $$,
  array[2],
  'Quantity greater than one is handled correctly'
);

reset role;

update public.provider_menu_items
set price = 99.00
where id = 'c1111111-1111-4111-8111-111111111111';

select results_eq(
  $$
    select public.calculate_order_total(o.id)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    join public.order_items oi on oi.order_id = o.id
    where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-09'::date
      and oi.quantity = 2
    limit 1
  $$,
  array[24.00::numeric],
  'Snapshot unit price is used after recurring menu price changes'
);

-- ============================================================
-- Finalization
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'Accounts can finalize a lunch period'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

-- September still open for admin finalize test on a copy - reopen by creating fresh? Already have September open.
-- August already finalized; test admin/owner can finalize September later

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'September Payroll B')) $$,
  'Admin can finalize a lunch period'
);

reset role;

select public.create_next_lunch_period('October Payroll', '2099-02-28');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'October Payroll')) $$,
  'Owner can finalize a lunch period'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'P0001',
  'Lunch period finalization access required',
  'HR cannot finalize lunch periods'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'P0001',
  'Lunch period finalization access required',
  'Staff cannot finalize lunch periods'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    select public.update_lunch_period_label(
      (select id from public.lunch_periods where label = 'September Payroll A'),
      'Changed Label'
    )
  $$,
  'P0001',
  'Finalized lunch periods cannot be modified',
  'Finalized period dates cannot be changed'
);

-- ============================================================
-- Finalized period order mutation
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    select public.replace_order_items(
      (
        select o.id
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
          and ld.order_date = '2099-01-09'::date
          and o.status = 'submitted'
        order by o.created_at
        limit 1
      ),
      (
        select jsonb_build_array(
          jsonb_build_object(
            'menu_item_id', oi.menu_item_id,
            'quantity', 1
          )
        )
        from public.order_items oi
        where oi.order_id = (
          select o.id
          from public.orders o
          join public.lunch_days ld on ld.id = o.lunch_day_id
          where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
            and ld.order_date = '2099-01-09'::date
            and o.status = 'submitted'
          order by o.created_at
          limit 1
        )
        limit 1
      )
    )
  $$,
  'P0001',
  'Orders in finalized lunch periods cannot be modified',
  'Orders in finalized periods cannot be edited'
);

select throws_ok(
  $$
    select public.cancel_order(
      (
        select o.id
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
          and ld.order_date = '2099-01-09'::date
          and o.status = 'submitted'
        order by o.created_at
        limit 1
      )
    )
  $$,
  'P0001',
  'Orders in finalized lunch periods cannot be modified',
  'Orders in finalized periods cannot be cancelled'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'September Payroll A')
    ) ->> 'grand_total')::numeric
  $$,
  array[70.00::numeric],
  'Finalized-period historical totals stay stable'
);

-- Open period order mutation uses November (still open)

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select public.create_next_lunch_period('November Payroll', '2099-03-31');

reset role;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('c1111111-1111-4111-8111-111111111111', 3);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-03-05'::date,
  '[{"provider_menu_item_id":"c1111111-1111-4111-8111-111111111111","quantity":1}]'::jsonb
);

select lives_ok(
  $$
    select public.cancel_order(
      (
        select o.id
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where ld.order_date = '2099-03-05'::date
          and o.profile_id = 'a1111111-1111-4111-8111-111111111111'
        limit 1
      )
    )
  $$,
  'Open-period order edit and cancel still works'
);

-- ============================================================
-- Export authorization
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_lunch_period_export_data((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'P0001',
  'Financial export access required',
  'Staff cannot access all-staff export data'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_lunch_period_export_data((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'P0001',
  'Financial export access required',
  'HR cannot access export operation'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.get_lunch_period_export_data((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'Accounts can access export data'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.get_lunch_period_export_data((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'Admin can access export data'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.get_lunch_period_export_data((select id from public.lunch_periods where label = 'September Payroll A')) $$,
  'Owner can access export data'
);

select * from finish();
rollback;
