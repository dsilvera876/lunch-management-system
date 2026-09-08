begin;

select plan(13);

\ir support/isolate_existing_owner.inc
\ir support/office_location_fixture.inc

-- ============================================================
-- Users
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'ops-staff@test.local', '{"full_name":"Ops Staff"}'),
  ('22222222-2222-4222-8222-222222222222', 'ops-hr@test.local', '{"full_name":"Ops HR"}'),
  ('33333333-3333-4333-8333-333333333333', 'ops-accounts@test.local', '{"full_name":"Ops Accounts"}'),
  ('44444444-4444-4444-8444-444444444444', 'ops-admin@test.local', '{"full_name":"Ops Admin"}'),
  ('55555555-5555-4555-8555-555555555555', 'ops-owner@test.local', '{"full_name":"Ops Owner"}');

reset role;

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'owner');

\ir support/assign_test_office_defaults.inc

-- ============================================================
-- Providers, menu, delivery-day fixture
-- Order date Fri 2099-01-09 -> delivery Mon 2099-01-12
-- ============================================================

reset role;

insert into public.lunch_providers (id, name, active)
values
  ('88888888-8888-4888-8888-888888888888', 'Ops Provider A', true),
  ('99999999-9999-4999-8999-999999999999', 'Ops Provider B', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, display_category, active)
values
  ('a1111111-1111-4111-8111-111111111111', '88888888-8888-4888-8888-888888888888', 'Fried Chicken', 12.00, 'main', 'Each', null, true),
  ('a2222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'Rice & Peas', 3.00, 'side', 'Each', null, true),
  ('a3333333-3333-4333-8333-333333333333', '88888888-8888-4888-8888-888888888888', 'Coconut Water', 2.00, 'standalone', 'Each', 'Juices', true),
  ('b1111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999', 'Grapes', 2.00, 'standalone', '1/4 LB', 'Fruit', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('a1111111-1111-4111-8111-111111111111', 5),
  ('a2222222-2222-4222-8222-222222222222', 5),
  ('a3333333-3333-4333-8333-333333333333', 5),
  ('b1111111-1111-4111-8111-111111111111', 5);

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":2,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[{"provider_menu_item_id":"a3333333-3333-4333-8333-333333333333","quantity":2}]}'::jsonb,
  'Extra gravy please',
  'f0000000-0000-4000-8000-000000000001'
);

select public.submit_provider_order(
  '99999999-9999-4999-8999-999999999999',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","quantity":4}]}'::jsonb,
  null,
  'f0000000-0000-4000-8000-000000000002'
);

-- Cancelled order on same delivery date should not affect operational totals
select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"a3333333-3333-4333-8333-333333333333","quantity":1}]}'::jsonb,
  null,
  'f0000000-0000-4000-8000-000000000001'
);

select public.cancel_order(o.id)
from public.orders o
join public.lunch_days ld on ld.id = o.lunch_day_id
where o.profile_id = '11111111-1111-4111-8111-111111111111'
  and ld.order_date = '2099-01-09'::date
  and o.status = 'submitted'
  and o.special_instructions is null
limit 1;

reset role;

-- ============================================================
-- Role access to operational order reads
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.lunch_date = '2099-01-12'::date
  $$,
  array[3::bigint],
  'HR can access operational orders by delivery date'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.lunch_date = '2099-01-12'::date
  $$,
  array[0::bigint],
  'Accounts cannot access operational order data'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.lunch_date = '2099-01-12'::date
      and o.profile_id <> '11111111-1111-4111-8111-111111111111'
  $$,
  array[0::bigint],
  'Staff cannot access management order data'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.lunch_date = '2099-01-12'::date
  $$,
  array[3::bigint],
  'Admin can access operational order data'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.lunch_date = '2099-01-12'::date
  $$,
  array[3::bigint],
  'Owner can access operational order data'
);

-- ============================================================
-- Delivery date vs order date
-- ============================================================

select results_eq(
  $$
    select ld.order_date::text
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.special_instructions = 'Extra gravy please'
    limit 1
  $$,
  array['2099-01-09'::text],
  'Financial order date is stored separately from delivery date'
);

select results_eq(
  $$
    select ld.lunch_date::text
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.special_instructions = 'Extra gravy please'
    limit 1
  $$,
  array['2099-01-12'::text],
  'Operational delivery date is stored on lunch_days.lunch_date'
);

select results_eq(
  $$
    select public.lunch_period_contains_order_date('2099-01-01', '2099-01-11', '2099-01-09')
  $$,
  array[true],
  'Financial period membership still uses order date'
);

select results_eq(
  $$
    select public.lunch_period_contains_order_date('2099-01-01', '2099-01-11', '2099-01-12')
  $$,
  array[false],
  'Delivery date does not determine financial period membership'
);

-- ============================================================
-- Snapshot quantities and special instructions
-- ============================================================

select results_eq(
  $$
    select o.meal_quantity::int
    from public.orders o
    where o.special_instructions = 'Extra gravy please'
  $$,
  array[2::int],
  'Meal quantity is preserved on orders'
);

select results_eq(
  $$
    select o.special_instructions
    from public.orders o
    where o.special_instructions = 'Extra gravy please'
  $$,
  array['Extra gravy please'::text],
  'Special instructions are preserved on orders'
);

select results_eq(
  $$
    select sum(oi.quantity)::bigint
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.lunch_date = '2099-01-12'::date
      and o.status <> 'cancelled'
      and mi.name = 'Fried Chicken'
  $$,
  array[2::bigint],
  'Preparation totals use stored order item quantities'
);

select results_eq(
  $$
    select mi.display_category
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.special_instructions = 'Extra gravy please'
      and mi.item_type = 'standalone'
    limit 1
  $$,
  array['Juices'::text],
  'Historical snapshot display category is stored on menu_items'
);

select * from finish();
rollback;
