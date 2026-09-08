begin;

select plan(7);

-- Ensure seeded lunch day is open with a future deadline for this test run.
reset role;

\ir support/legacy_lunch_day_fixture.inc

-- ------------------------------------------------------------
-- Test users
-- ------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'f1111111-1111-4111-8111-111111111111',
  'edit-owner@test.local',
  '{"full_name":"Edit Owner"}'
),
(
  'f2222222-2222-4222-8222-222222222222',
  'other-user@test.local',
  '{"full_name":"Other User"}'
);

-- Create an order as the owner.
set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

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
);

-- ------------------------------------------------------------
-- 1. Owner can edit their order.
-- ------------------------------------------------------------

select lives_ok(
  $$
    select public.replace_order_items(
      (
        select id
        from public.orders
        where profile_id = 'f1111111-1111-4111-8111-111111111111'
          and status = 'submitted'
      ),
      '{
        "meal_quantity": null,
        "main_menu_item_id": null,
        "side_menu_item_ids": [],
        "standalone_items": [
          {"menu_item_id": "20000000-0000-0000-0000-000000000002", "quantity": 2}
        ]
      }'::jsonb,
      null
    )
  $$,
  'Owner can replace order items'
);

-- 2. Replacement actually occurred.
select results_eq(
  $$
    select quantity
    from public.order_items
    where order_id = (
      select id
      from public.orders
      where profile_id = 'f1111111-1111-4111-8111-111111111111'
        and status = 'submitted'
    )
  $$,
  array[2],
  'Edited order contains replacement quantity'
);

-- ------------------------------------------------------------
-- Switch to other user.
-- ------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

-- 3. Another user cannot edit the order.
select throws_ok(
  $$
    select public.replace_order_items(
      (
        select id
        from public.orders
        where profile_id = 'f1111111-1111-4111-8111-111111111111'
      ),
      '{
        "meal_quantity": null,
        "main_menu_item_id": null,
        "side_menu_item_ids": [],
        "standalone_items": [
          {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
        ]
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Order does not exist',
  'Another user cannot edit someone elses order'
);

-- Because RLS hides the row from the SECURITY DEFINER function caller's
-- initial SELECT when invoked through auth.uid ownership semantics,
-- unauthorized access must fail.

-- ------------------------------------------------------------
-- Switch back to owner.
-- ------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

-- 4. Invalid replacement rolls back atomically.
select throws_ok(
  $$
    select public.replace_order_items(
      (
        select id
        from public.orders
        where profile_id = 'f1111111-1111-4111-8111-111111111111'
          and status = 'submitted'
      ),
      '{
        "meal_quantity": null,
        "main_menu_item_id": null,
        "side_menu_item_ids": [],
        "standalone_items": [
          {"menu_item_id": "29999999-9999-4999-8999-999999999999", "quantity": 1}
        ]
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Menu item is invalid or inactive',
  'Invalid replacement fails'
);

-- 5. Original replacement survives failed edit.
select results_eq(
  $$
    select quantity
    from public.order_items
    where order_id = (
      select id
      from public.orders
      where profile_id = 'f1111111-1111-4111-8111-111111111111'
        and status = 'submitted'
    )
  $$,
  array[2],
  'Failed edit leaves previous order intact'
);

-- 6. Owner can cancel before deadline.
select lives_ok(
  $$
    select public.cancel_order(
      (
        select id
        from public.orders
        where profile_id = 'f1111111-1111-4111-8111-111111111111'
          and status = 'submitted'
      )
    )
  $$,
  'Owner can cancel their order'
);

-- 7. Owner can submit a replacement order after cancellation.
select lives_ok(
  $$
    select public.submit_order(
      '10000000-0000-0000-0000-000000000001',
      '{
        "meal_quantity": null,
        "main_menu_item_id": null,
        "side_menu_item_ids": [],
        "standalone_items": [
          {"menu_item_id": "20000000-0000-0000-0000-000000000003", "quantity": 1}
        ]
      }'::jsonb
    )
  $$,
  'User can submit a new order after cancelling'
);

select * from finish();

rollback;