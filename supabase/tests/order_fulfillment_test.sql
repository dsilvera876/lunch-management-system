begin;

select plan(4);

-- Ensure seeded lunch day is open with a future deadline for this test run.
reset role;

\ir support/legacy_lunch_day_fixture.inc

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'f3333333-3333-4333-8333-333333333333',
  'admin-fulfill@test.local',
  '{"full_name":"Fulfillment Admin"}'
),
(
  'f4444444-4444-4444-8444-444444444444',
  'normal-fulfill@test.local',
  '{"full_name":"Fulfillment User"}'
);

reset role;
select private.apply_profile_role('f3333333-3333-4333-8333-333333333333', 'admin');

-- Create one order for the normal user.
set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f4444444-4444-4444-8444-444444444444',
    'role', 'authenticated'
  )::text,
  true
);

select public.submit_order(
  '10000000-0000-0000-0000-000000000001',
  '{"meal_quantity":null,"main_menu_item_id":null,"side_menu_item_ids":[],"standalone_items":[{"menu_item_id":"20000000-0000-0000-0000-000000000001","quantity":1}]}'::jsonb
);

-- 1. Normal user cannot fulfill.
select throws_ok(
  $$
    select public.fulfill_order(
      (
        select id
        from public.orders
        where profile_id = 'f4444444-4444-4444-8444-444444444444'
          and status = 'submitted'
      )
    )
  $$,
  'P0001',
  'Fulfillment access required',
  'Normal user cannot fulfill an order'
);

-- Switch to admin.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f3333333-3333-4333-8333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);

-- 2. Admin can fulfill.
select lives_ok(
  $$
    select public.fulfill_order(
      (
        select id
        from public.orders
        where profile_id = 'f4444444-4444-4444-8444-444444444444'
          and status = 'submitted'
      )
    )
  $$,
  'Admin can fulfill a submitted order'
);

-- 3. Fulfilled order cannot be fulfilled twice.
select throws_ok(
  $$
    select public.fulfill_order(
      (
        select id
        from public.orders
        where profile_id = 'f4444444-4444-4444-8444-444444444444'
      )
    )
  $$,
  'P0001',
  'Only submitted orders can be fulfilled',
  'Fulfilled order cannot be fulfilled twice'
);

-- Create a cancelled order directly for test setup.
reset role;

insert into public.orders (
  id,
  profile_id,
  lunch_day_id,
  status
)
values (
  '50000000-0000-0000-0000-000000000001',
  'f4444444-4444-4444-8444-444444444444',
  '10000000-0000-0000-0000-000000000001',
  'cancelled'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f3333333-3333-4333-8333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);

-- 4. Cancelled order cannot be fulfilled.
select throws_ok(
  $$
    select public.fulfill_order(
      '50000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'Only submitted orders can be fulfilled',
  'Cancelled order cannot be fulfilled'
);

select * from finish();

rollback;