begin;

select plan(6);

-- Ensure seeded lunch day is open with a future deadline for this test run.
reset role;

\ir support/submit_order_lunch_day_fixture.inc

-- ------------------------------------------------------------
-- Create two test users.
-- The auth.users trigger automatically creates profiles.
-- ------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'user-a@test.local',
  '{"full_name":"User A"}'
),
(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'user-b@test.local',
  '{"full_name":"User B"}'
);

\ir support/assign_test_office_defaults.inc

-- Give User B an order so we can test isolation.
insert into public.orders (
  id,
  profile_id,
  lunch_day_id
)
values (
  '30000000-0000-0000-0000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '10000000-0000-0000-0000-000000000001'
);

-- ------------------------------------------------------------
-- Authenticate as User A
-- ------------------------------------------------------------

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'role', 'authenticated'
  )::text,
  true
);

-- 1. User A can see only their own profile.
select results_eq(
  $$ select count(*) from public.profiles $$,
  array[1::bigint],
  'User can only see their own profile'
);

-- 2. User A cannot see User B's order.
select results_eq(
  $$ select count(*) from public.orders $$,
  array[0::bigint],
  'User cannot see another users orders'
);

-- 3. User A cannot directly create orders.
select throws_ok(
  $$
    insert into public.orders (
      id,
      profile_id,
      lunch_day_id
    )
    values (
      '30000000-0000-0000-0000-000000000001',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'User cannot directly create orders'
);

-- 4. User A cannot directly add order items.
select throws_ok(
  $$
    insert into public.order_items (
      id,
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity,
      unit_price
    )
    values (
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      1,
      0.01
    )
  $$,
  '42501',
  null,
  'User cannot directly add order items'
);

-- 5. Trusted submit_order controls pricing.
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
  'User can submit an order through trusted RPC'
);

select results_eq(
  $$
    select unit_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.profile_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    order by o.created_at desc
    limit 1
  $$,
  array[12.00::numeric],
  'Database controls order item pricing'
);

select * from finish();

rollback;