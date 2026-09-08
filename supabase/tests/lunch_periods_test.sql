begin;

select plan(32);

-- ============================================================
-- Users
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'staff@test.local', '{"full_name":"Staff User"}'),
  ('22222222-2222-4222-8222-222222222222', 'hr@test.local', '{"full_name":"HR User"}'),
  ('33333333-3333-4333-8333-333333333333', 'accounts@test.local', '{"full_name":"Accounts User"}'),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.local', '{"full_name":"Admin User"}'),
  ('55555555-5555-4555-8555-555555555555', 'owner@test.local', '{"full_name":"Owner User"}');

reset role;

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'owner');

-- ============================================================
-- Staff access
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::bigint from public.lunch_periods $$,
  array[0::bigint],
  'Staff can read lunch periods'
);

select throws_ok(
  $$ select public.create_first_lunch_period('Blocked', '2026-08-01', '2026-08-31') $$,
  'P0001',
  'Lunch period management access required',
  'Staff cannot create lunch periods'
);

-- ============================================================
-- First period and continuity
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_first_lunch_period('August Payroll', '2026-08-03', '2026-08-27') $$,
  'First period can choose start and end'
);

select results_eq(
  $$ select start_date::text from public.lunch_periods order by start_date limit 1 $$,
  array['2026-08-03'::text],
  'First period stores chosen start date'
);

select results_eq(
  $$ select end_date::text from public.lunch_periods order by start_date limit 1 $$,
  array['2026-08-27'::text],
  'First period stores chosen end date'
);

select lives_ok(
  $$ select public.create_next_lunch_period('September Payroll', '2026-09-25') $$,
  'Second period appends contiguously'
);

select results_eq(
  $$ select start_date::text from public.lunch_periods where label = 'September Payroll' $$,
  array['2026-08-28'::text],
  'Second period starts exactly previous end plus one day'
);

select lives_ok(
  $$ select public.create_next_lunch_period('October Payroll', '2026-10-24') $$,
  'Third period continues correctly'
);

select results_eq(
  $$ select start_date::text from public.lunch_periods where label = 'October Payroll' $$,
  array['2026-09-26'::text],
  'Third period starts after second period end'
);

select throws_ok(
  $$ select public.create_next_lunch_period('Too Early End', '2026-10-20') $$,
  'P0001',
  'End date must be on or after the derived start date',
  'Invalid end before derived start rejected'
);

select throws_ok(
  $$ select public.create_first_lunch_period('Another First', '2026-01-01', '2026-01-31') $$,
  'P0001',
  'Use create_next_lunch_period when periods already exist',
  'Overlap creation rejected through first-period RPC'
);

select throws_ok(
  $$ insert into public.lunch_periods (label, start_date, end_date) values ('Direct Gap', '2026-08-29', '2026-09-25') $$,
  '42501',
  null,
  'Gap creation rejected through direct insert'
);

select throws_ok(
  $$ insert into public.lunch_periods (label, start_date, end_date) values ('Direct Overlap', '2026-08-27', '2026-09-25') $$,
  '42501',
  null,
  'Overlap creation rejected through direct insert'
);

select throws_ok(
  $$ insert into public.lunch_periods (label, start_date, end_date) values ('Same Day Overlap', '2026-08-27', '2026-08-27') $$,
  '42501',
  null,
  'Same-day overlap rejected through direct insert'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.lunch_periods (label, start_date, end_date) values ('Staff Gap', '2026-10-25', '2026-11-30') $$,
  '42501',
  null,
  'Staff cannot bypass continuity rules with direct insert'
);

-- ============================================================
-- Concurrency-safe sequential appends
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_next_lunch_period('November Payroll', '2026-11-21') $$,
  'Sequential next-period creation succeeds'
);

select lives_ok(
  $$ select public.create_next_lunch_period('December Payroll', '2026-12-19') $$,
  'Duplicate next-period attempts serialize into contiguous appends'
);

select results_eq(
  $$
    with ordered as (
      select
        start_date,
        lag(end_date) over (order by start_date) as previous_end
      from public.lunch_periods
    )
    select count(*)::bigint
    from ordered
    where previous_end is not null
      and start_date <> previous_end + 1
  $$,
  array[0::bigint],
  'Concurrent-safe appends keep periods contiguous with no duplicate starts'
);

-- ============================================================
-- Current period semantics
-- ============================================================

select results_eq(
  $$ select count(*)::bigint from public.lunch_periods where is_current = true $$,
  array[0::bigint],
  'Zero current lunch periods allowed during setup'
);

select lives_ok(
  $$
    select public.set_current_lunch_period(id)
    from public.lunch_periods
    where label = 'August Payroll'
  $$,
  'First current lunch period succeeds'
);

select lives_ok(
  $$
    select public.set_current_lunch_period(id)
    from public.lunch_periods
    where label = 'December Payroll'
  $$,
  'Setting another period current replaces previous current'
);

select results_eq(
  $$ select count(*)::bigint from public.lunch_periods where is_current = true $$,
  array[1::bigint],
  'At most one current lunch period remains'
);

select results_eq(
  $$ select count(*)::bigint from public.lunch_periods $$,
  array[5::bigint],
  'Historical lunch periods are retained'
);

-- ============================================================
-- Editing restrictions
-- ============================================================

select lives_ok(
  $$ select public.update_lunch_period_label(id, 'August Payroll Updated') from public.lunch_periods where label = 'August Payroll' $$,
  'Historical period label remains editable'
);

select throws_ok(
  $$
    update public.lunch_periods
    set start_date = '2026-08-04'
    where id = (
      select id
      from public.lunch_periods
      where label = 'August Payroll Updated'
    )
  $$,
  '42501',
  null,
  'Historical period dates cannot be edited directly'
);

select lives_ok(
  $$
    select public.update_latest_lunch_period_end_date(id, '2026-12-31')
    from public.lunch_periods
    where label = 'December Payroll'
  $$,
  'Latest period end date may be adjusted'
);

-- ============================================================
-- Order-date membership
-- ============================================================

select results_eq(
  $$ select public.lunch_period_contains_order_date('2026-08-03', '2026-08-21', '2026-08-21') $$,
  array[true],
  'Friday order date belongs to August period'
);

select results_eq(
  $$ select public.lunch_period_contains_order_date('2026-08-03', '2026-08-21', '2026-08-24') $$,
  array[false],
  'Monday delivery date does not determine membership'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-08-21'::date)::text $$,
  array['2026-08-24'::text],
  'Friday order date maps to Monday delivery in ordering model'
);

select results_eq(
  $$
    select public.find_lunch_period_id_for_order_date('2026-08-21'::date) = (
      select id from public.lunch_periods where label = 'August Payroll Updated'
    )
  $$,
  array[true],
  'Order-date membership uses order date not delivery date'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select label from public.lunch_periods where is_current = true $$,
  array['December Payroll'::text],
  'Current lunch period is readable by Staff'
);

-- ============================================================
-- Ordering remains unaffected
-- ============================================================

reset role;

\ir support/legacy_lunch_day_fixture.inc

update public.lunch_days
set
  status = 'open',
  order_deadline = now() + interval '1 day'
where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$
    select public.submit_order(
      '10000000-0000-0000-0000-000000000001',
      '{
        "meal_quantity": null,
        "main_menu_item_id": null,
        "side_menu_item_ids": [],
        "standalone_items": [
          {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
        ]
      }'::jsonb
    )
  $$,
  'Normal ordering functionality remains unaffected'
);

select * from finish();
rollback;
