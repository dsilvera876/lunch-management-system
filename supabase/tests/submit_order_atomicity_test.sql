begin;

select plan(3);

-- Ensure seeded lunch day is open with a future deadline for this test run.
reset role;

\ir support/legacy_lunch_day_fixture.inc

-- Create test user. Profile is created automatically by trigger.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'atomic@test.local',
  '{"full_name":"Atomic Test User"}'
);

\ir support/assign_test_office_defaults.inc

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'role', 'authenticated'
  )::text,
  true
);

-- First item is valid; second item does not exist.
-- The entire submit_order() call must roll back.
select throws_ok(
  $$
    select public.submit_order(
      '10000000-0000-0000-0000-000000000001',
      '{"meal_quantity":null,"main_menu_item_id":null,"side_menu_item_ids":[],"standalone_items":[{"menu_item_id":"20000000-0000-0000-0000-000000000001","quantity":1},{"menu_item_id":"29999999-9999-4999-8999-999999999999","quantity":1}]}'::jsonb
    )
  $$,
  'P0001',
  'Menu item is invalid or inactive',
  'Invalid item causes order submission to fail'
);

-- No order should survive the failed transaction.
select results_eq(
  $$
    select count(*)
    from public.orders
    where profile_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  $$,
  array[0::bigint],
  'Failed submission leaves no order behind'
);

-- No partial order items should survive either.
select results_eq(
  $$
    select count(*)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.profile_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  $$,
  array[0::bigint],
  'Failed submission leaves no order items behind'
);

select * from finish();

rollback;