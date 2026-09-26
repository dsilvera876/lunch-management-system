begin;

select plan(29);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'b1111111-1111-4111-8111-111111111111',
  'write-staff@test.local',
  '{"full_name":"Write Staff"}'
),
(
  'b2222222-2222-4222-8222-222222222222',
  'write-hr@test.local',
  '{"full_name":"Write HR"}'
),
(
  'b3333333-3333-4333-8333-333333333333',
  'write-admin@test.local',
  '{"full_name":"Write Admin"}'
);

reset role;
select private.apply_profile_role('b2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('b3333333-3333-4333-8333-333333333333', 'admin');

insert into public.lunch_providers (id, name, active)
values ('c1111111-1111-4111-8111-111111111111', 'Write Test Kitchen', true);

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  item_type,
  unit_label,
  active
)
values
  ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Write Main', 10.00, 'main', 'Each', true),
  ('d2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111', 'Write Side', 3.00, 'side', 'Each', true),
  ('d3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', 'Write Snack', 2.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select id, 1
from public.provider_menu_items
where provider_id = 'c1111111-1111-4111-8111-111111111111';

\ir support/open_ordering.inc
\ir support/submit_order_lunch_day_fixture.inc

select ok(
  not has_function_privilege(
    'authenticated',
    'private.ensure_provider_lunch_day(uuid,date)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.ensure_provider_lunch_day(uuid,date)',
    'EXECUTE'
  ),
  'API roles cannot execute the private lunch-day snapshot helper'
);

-- Table privilege matrix (authoritative has_table_privilege checks).

select ok(
  has_table_privilege('authenticated', 'public.orders', 'SELECT')
  and not has_table_privilege('authenticated', 'public.orders', 'INSERT')
  and not has_table_privilege('authenticated', 'public.orders', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.orders', 'DELETE')
  and not has_table_privilege('authenticated', 'public.orders', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.orders', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.orders', 'TRIGGER'),
  'authenticated orders: SELECT only'
);

select ok(
  has_table_privilege('authenticated', 'public.order_items', 'SELECT')
  and not has_table_privilege('authenticated', 'public.order_items', 'INSERT')
  and not has_table_privilege('authenticated', 'public.order_items', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.order_items', 'DELETE')
  and not has_table_privilege('authenticated', 'public.order_items', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.order_items', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.order_items', 'TRIGGER'),
  'authenticated order_items: SELECT only'
);

select ok(
  not has_table_privilege('anon', 'public.orders', 'SELECT')
  and not has_table_privilege('anon', 'public.orders', 'INSERT')
  and not has_table_privilege('anon', 'public.orders', 'UPDATE')
  and not has_table_privilege('anon', 'public.orders', 'DELETE')
  and not has_table_privilege('anon', 'public.orders', 'TRUNCATE')
  and not has_table_privilege('anon', 'public.orders', 'REFERENCES')
  and not has_table_privilege('anon', 'public.orders', 'TRIGGER'),
  'anon has no orders table privileges'
);

select ok(
  not has_table_privilege('anon', 'public.order_items', 'SELECT')
  and not has_table_privilege('anon', 'public.order_items', 'INSERT')
  and not has_table_privilege('anon', 'public.order_items', 'UPDATE')
  and not has_table_privilege('anon', 'public.order_items', 'DELETE')
  and not has_table_privilege('anon', 'public.order_items', 'TRUNCATE')
  and not has_table_privilege('anon', 'public.order_items', 'REFERENCES')
  and not has_table_privilege('anon', 'public.order_items', 'TRIGGER'),
  'anon has no order_items table privileges'
);

-- Anon cannot mutate tables or execute order RPCs.

set local role anon;

select throws_ok(
  $$
    insert into public.orders (profile_id, lunch_day_id)
    values (
      'b1111111-1111-4111-8111-111111111111',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'anon cannot insert orders'
);

select throws_ok(
  $$
    insert into public.order_items (order_id, menu_item_id, quantity)
    values (
      '99999999-9999-4999-8999-999999999901',
      '20000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  '42501',
  null,
  'anon cannot insert order items'
);

select throws_ok(
  $$ select public.submit_order('10000000-0000-0000-0000-000000000001', '{}'::jsonb) $$,
  '42501',
  null,
  'anon cannot execute submit_order'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'c1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{}'::jsonb,
      null
    )
  $$,
  '42501',
  null,
  'anon cannot execute submit_provider_order'
);

select throws_ok(
  $$
    select public.replace_order_items(
      '99999999-9999-4999-8999-999999999901',
      '{}'::jsonb,
      null
    )
  $$,
  '42501',
  null,
  'anon cannot execute replace_order_items'
);

select throws_ok(
  $$ select public.cancel_order('99999999-9999-4999-8999-999999999901') $$,
  '42501',
  null,
  'anon cannot execute cancel_order'
);

select throws_ok(
  $$ select public.fulfill_order('99999999-9999-4999-8999-999999999901') $$,
  '42501',
  null,
  'anon cannot execute fulfill_order'
);

-- Direct table writes are blocked for authenticated staff.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    insert into public.orders (profile_id, lunch_day_id, meal_quantity)
    values (
      'b1111111-1111-4111-8111-111111111111',
      '10000000-0000-0000-0000-000000000001',
      2
    )
  $$,
  '42501',
  null,
  'Staff cannot directly insert orphan orders'
);

select throws_ok(
  $$
    insert into public.order_items (order_id, menu_item_id, quantity)
    values (
      '99999999-9999-4999-8999-999999999901',
      '20000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  '42501',
  null,
  'Staff cannot directly insert order items'
);

select throws_ok(
  $$
    update public.orders
    set meal_quantity = 5
    where id = '99999999-9999-4999-8999-999999999901'
  $$,
  '42501',
  null,
  'Staff cannot directly update orders'
);

select throws_ok(
  $$
    update public.order_items
    set quantity = 5
    where order_id = '99999999-9999-4999-8999-999999999901'
  $$,
  '42501',
  null,
  'Staff cannot directly update order items'
);

select throws_ok(
  $$
    delete from public.orders
    where id = '99999999-9999-4999-8999-999999999901'
  $$,
  '42501',
  null,
  'Staff cannot directly delete orders'
);

select throws_ok(
  $$
    truncate public.orders
  $$,
  '42501',
  null,
  'Staff cannot truncate orders'
);

select throws_ok(
  $$
    truncate public.order_items
  $$,
  '42501',
  null,
  'Staff cannot truncate order_items'
);

-- HR fulfillment role cannot bypass through direct order_items writes.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    insert into public.order_items (order_id, menu_item_id, quantity)
    values (
      '99999999-9999-4999-8999-999999999901',
      '20000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  '42501',
  null,
  'HR cannot directly manipulate order items'
);

-- Admin cannot bypass composition through direct table writes.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    insert into public.orders (profile_id, lunch_day_id, meal_quantity)
    values (
      'b3333333-3333-4333-8333-333333333333',
      '10000000-0000-0000-0000-000000000001',
      3
    )
  $$,
  '42501',
  null,
  'Admin cannot directly insert orders with meal quantity'
);

select throws_ok(
  $$
    delete from public.order_items
    where order_id = '99999999-9999-4999-8999-999999999901'
  $$,
  '42501',
  null,
  'Admin cannot directly delete order items'
);

-- Trusted RPC paths remain valid for staff.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'c1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 2,
        "main_provider_menu_item_id": "d1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": ["d2222222-2222-4222-8222-222222222222"],
        "standalone_items": [
          {"provider_menu_item_id": "d3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null
    )
  $$,
  'Trusted provider submit succeeds for mixed meal order'
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'c1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "d3333333-3333-4333-8333-333333333333", "quantity": 2}
        ]
      }'::jsonb,
      null
    )
  $$,
  'Trusted provider submit succeeds for standalone-only order'
);

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
  'Trusted legacy submit_order RPC still succeeds'
);

select lives_ok(
  $$
    select public.replace_order_items(
      (
        select o.id
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where o.profile_id = 'b1111111-1111-4111-8111-111111111111'
          and ld.provider_id = 'c1111111-1111-4111-8111-111111111111'
          and o.meal_quantity = 2
        order by o.created_at
        limit 1
      ),
      jsonb_build_object(
        'meal_quantity', 3,
        'main_menu_item_id', (
          select mi.id
          from public.menu_items mi
          join public.lunch_days ld on ld.id = mi.lunch_day_id
          where ld.provider_id = 'c1111111-1111-4111-8111-111111111111'
            and ld.order_date = '2099-01-05'::date
            and mi.provider_menu_item_id = 'd1111111-1111-4111-8111-111111111111'
        ),
        'side_menu_item_ids', jsonb_build_array(
          (
            select mi.id
            from public.menu_items mi
            join public.lunch_days ld on ld.id = mi.lunch_day_id
            where ld.provider_id = 'c1111111-1111-4111-8111-111111111111'
              and ld.order_date = '2099-01-05'::date
              and mi.provider_menu_item_id = 'd2222222-2222-4222-8222-222222222222'
          )
        ),
        'standalone_items', '[]'::jsonb
      ),
      null
    )
  $$,
  'Trusted replace_order_items RPC still succeeds'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'c1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 2,
        "main_provider_menu_item_id": "d1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": [],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'A main item requires at least one side item',
  'Invalid aggregate composition cannot be persisted through trusted RPC'
);

-- Fulfillment remains RPC-only with role checks inside the function.

reset role;

insert into public.orders (id, profile_id, lunch_day_id, status)
values (
  'e1111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  '10000000-0000-0000-0000-000000000001',
  'submitted'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.fulfill_order('e1111111-1111-4111-8111-111111111111') $$,
  'P0001',
  'Fulfillment access required',
  'Staff cannot fulfill orders through RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.fulfill_order('e1111111-1111-4111-8111-111111111111') $$,
  'HR can fulfill orders through trusted RPC'
);

select * from finish();
rollback;
