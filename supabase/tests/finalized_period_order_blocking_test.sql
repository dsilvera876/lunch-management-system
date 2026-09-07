begin;

select plan(6);

-- ============================================================
-- Setup
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10111111-1111-4111-8111-111111111111', 'final-staff@test.local', '{"full_name":"Final Staff"}'),
  ('10444444-4444-4444-8444-444444444444', 'final-accounts@test.local', '{"full_name":"Final Accounts"}');

reset role;

select private.apply_profile_role('10444444-4444-4444-8444-444444444444', 'accounts');

insert into public.lunch_providers (id, name, active)
values ('10222222-2222-4222-8222-222222222222', 'Finalized Guard Kitchen', true);

insert into public.provider_menu_items (id, provider_id, name, price, active)
values ('10333333-3333-4333-8333-333333333333', '10222222-2222-4222-8222-222222222222', 'Guard Meal', 12.00, true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('10333333-3333-4333-8333-333333333333', 1),
  ('10333333-3333-4333-8333-333333333333', 2),
  ('10333333-3333-4333-8333-333333333333', 5);

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '10444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select public.create_first_lunch_period('Guard Payroll A', '2026-09-01', '2026-09-11');
select public.create_next_lunch_period('Guard Payroll B', '2026-09-25');

select public.set_current_lunch_period(id)
from public.lunch_periods
where label = 'Guard Payroll A';

select set_config('request.jwt.claims', json_build_object('sub', '10111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- ============================================================
-- 1. Open lunch period allows new order before cutoff
-- ============================================================

select lives_ok(
  $$
    select public.submit_provider_order(
      '10222222-2222-4222-8222-222222222222',
      '2026-09-11'::date,
      '[{"provider_menu_item_id":"10333333-3333-4333-8333-333333333333","quantity":1}]'::jsonb
    )
  $$,
  'Open lunch period allows new provider order before cutoff'
);

-- ============================================================
-- Finalize the period containing 2026-09-11
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '10444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select public.finalize_lunch_period(
  (select id from public.lunch_periods where label = 'Guard Payroll A')
);

select set_config('request.jwt.claims', json_build_object('sub', '10111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- ============================================================
-- 2. Finalized lunch period rejects new provider order
-- ============================================================

select throws_ok(
  $$
    select public.submit_provider_order(
      '10222222-2222-4222-8222-222222222222',
      '2026-09-11'::date,
      '[{"provider_menu_item_id":"10333333-3333-4333-8333-333333333333","quantity":1}]'::jsonb
    )
  $$,
  'P0001',
  'Ordering is unavailable because this lunch period has been finalized',
  'Finalized lunch period rejects new provider order'
);

-- ============================================================
-- 3. Finalized period rejects direct insert trigger path
-- ============================================================

select throws_ok(
  $$
    insert into public.orders (profile_id, lunch_day_id)
    values (
      '10111111-1111-4111-8111-111111111111',
      (
        select id
        from public.lunch_days
        where provider_id = '10222222-2222-4222-8222-222222222222'
          and order_date = '2026-09-11'::date
      )
    )
  $$,
  'P0001',
  'Ordering is unavailable because this lunch period has been finalized',
  'Finalized period rejects direct order insert path'
);

-- ============================================================
-- 4. Changing cutoff later does not reopen finalized period
-- ============================================================

reset role;

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '10111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    select public.submit_provider_order(
      '10222222-2222-4222-8222-222222222222',
      '2026-09-11'::date,
      '[{"provider_menu_item_id":"10333333-3333-4333-8333-333333333333","quantity":1}]'::jsonb
    )
  $$,
  'P0001',
  'Ordering is unavailable because this lunch period has been finalized',
  'Changing cutoff later does not reopen finalized period ordering'
);

-- ============================================================
-- 5. Finalized financial totals cannot increase from new orders
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '10444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select (public.get_lunch_period_financial_summary(
      (select id from public.lunch_periods where label = 'Guard Payroll A')
    ) ->> 'grand_total')::numeric
  $$,
  array[12.00::numeric],
  'Finalized financial totals remain unchanged after blocked submissions'
);

-- ============================================================
-- 6. Later open lunch period still accepts orders normally
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '10111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$
    select public.submit_provider_order(
      '10222222-2222-4222-8222-222222222222',
      '2026-09-14'::date,
      '[{"provider_menu_item_id":"10333333-3333-4333-8333-333333333333","quantity":1}]'::jsonb
    )
  $$,
  'Later open lunch period accepts new orders normally'
);

select * from finish();
rollback;
