begin;

select plan(26);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'a1111111-1111-4111-8111-111111111111',
  'composition-admin@test.local',
  '{"full_name":"Composition Admin"}'
),
(
  'a2222222-2222-4222-8222-222222222222',
  'composition-user@test.local',
  '{"full_name":"Composition User"}'
);

reset role;
select private.apply_profile_role('a1111111-1111-4111-8111-111111111111', 'admin');

insert into public.lunch_providers (id, name, active)
values
  ('b1111111-1111-4111-8111-111111111111', 'Meal Provider', true),
  ('b2222222-2222-4222-8222-222222222222', 'Juice Provider', true),
  ('b3333333-3333-4333-8333-333333333333', 'Fruit Provider', true);

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
  ('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Fried Chicken', 12.00, 'main', 'Each', true),
  ('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'Rice and Peas', 3.00, 'side', 'Each', true),
  ('c3333333-3333-4333-8333-333333333333', 'b1111111-1111-4111-8111-111111111111', 'Curry Chicken', 11.00, 'main', 'Each', true),
  ('c4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'Vegetables', 2.50, 'side', 'Each', true),
  ('c5555555-5555-4555-8555-555555555555', 'b1111111-1111-4111-8111-111111111111', 'Coconut Water', 4.00, 'standalone', 'Bottle', true),
  ('c6666666-6666-4666-8666-666666666666', 'b2222222-2222-4222-8222-222222222222', 'Cran Water', 3.50, 'standalone', 'Bottle', true),
  ('c7777777-7777-4777-8777-777777777777', 'b3333333-3333-4333-8333-333333333333', 'Red Seedless Grapes', 2.00, 'standalone', '1/4 LB', true),
  ('c8888888-8888-4888-8888-888888888888', 'b3333333-3333-4333-8333-333333333333', 'Banana', 1.00, 'standalone', 'Each', true),
  ('c9999999-9999-4999-8999-999999999999', 'b1111111-1111-4111-8111-111111111111', 'Tuesday Only Main', 10.00, 'main', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select id, wd
from public.provider_menu_items
cross join generate_series(1, 5) as wd
where provider_id in (
  'b1111111-1111-4111-8111-111111111111',
  'b2222222-2222-4222-8222-222222222222',
  'b3333333-3333-4333-8333-333333333333'
)
  and id <> 'c9999999-9999-4999-8999-999999999999';

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('c9999999-9999-4999-8999-999999999999', 2);

\ir support/open_ordering.inc

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

-- Meal composition success cases

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 1,
        "main_provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": ["c2222222-2222-4222-8222-222222222222"],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'Meal quantity 1 succeeds'
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 2,
        "main_provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": [
          "c2222222-2222-4222-8222-222222222222",
          "c4444444-4444-4444-8444-444444444444"
        ],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'Meal quantity 2 succeeds'
);

select is(
  (
    select array_agg(oi.quantity order by mi.item_type, mi.name)
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and o.meal_quantity = 2
      and mi.item_type in ('main', 'side')
  ),
  array[2, 2, 2],
  'Main and side line quantities equal meal quantity'
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 2,
        "main_provider_menu_item_id": "c3333333-3333-4333-8333-333333333333",
        "side_provider_menu_item_ids": ["c2222222-2222-4222-8222-222222222222"],
        "standalone_items": [
          {"provider_menu_item_id": "c5555555-5555-4555-8555-555555555555", "quantity": 3}
        ]
      }'::jsonb,
      'Extra gravy on rice'
    )
  $$,
  'Mixed meal x2 plus standalone x3 succeeds with special instructions'
);

select is(
  (
    select o.meal_quantity
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b2222222-2222-4222-8222-222222222222'
      and o.status = 'submitted'
    limit 1
  ),
  null,
  'Standalone-only orders have no meal bundle quantity'
);

-- Standalone-only success cases

select lives_ok(
  $$
    select public.submit_provider_order(
      'b2222222-2222-4222-8222-222222222222',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c6666666-6666-4666-8666-666666666666", "quantity": 2}
        ]
      }'::jsonb,
      null
    )
  $$,
  'Juice-only standalone order succeeds'
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b3333333-3333-4333-8333-333333333333',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c7777777-7777-4777-8777-777777777777", "quantity": 4},
          {"provider_menu_item_id": "c8888888-8888-4888-8888-888888888888", "quantity": 4}
        ]
      }'::jsonb,
      null
    )
  $$,
  'Multiple standalone fruit items succeed'
);

-- Invalid compositions

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 1,
        "main_provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": [],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'A main item requires at least one side item',
  'Main without side is rejected'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 1,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": ["c2222222-2222-4222-8222-222222222222"],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Side items require a main item',
  'Side without main is rejected'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Order must contain at least one item',
  'Empty order is rejected'
);

select throws_like(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c6666666-6666-4666-8666-666666666666", "quantity": 1}
        ]
      }'::jsonb,
      null
    )
  $$,
  '%Menu item % for provider % is invalid or inactive%',
  'Cross-provider items are rejected'
);

select throws_like(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 1,
        "main_provider_menu_item_id": "c9999999-9999-4999-8999-999999999999",
        "side_provider_menu_item_ids": ["c2222222-2222-4222-8222-222222222222"],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  '%Menu item % for provider % is invalid or inactive%',
  'Unavailable weekday main is rejected'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c5555555-5555-4555-8555-555555555555", "quantity": 0}
        ]
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Quantity must be greater than zero',
  'Invalid standalone quantity is rejected'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": 0,
        "main_provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": ["c2222222-2222-4222-8222-222222222222"],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Meal quantity must be greater than zero',
  'Meal quantity zero is rejected'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": -1,
        "main_provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
        "side_provider_menu_item_ids": ["c2222222-2222-4222-8222-222222222222"],
        "standalone_items": []
      }'::jsonb,
      null
    )
  $$,
  'P0001',
  'Meal quantity must be greater than zero',
  'Negative meal quantity is rejected'
);

reset role;

select throws_ok(
  $$
    update public.order_items oi
    set quantity = 1
    from public.orders o, public.menu_items mi
    where oi.order_id = o.id
      and oi.menu_item_id = mi.id
      and o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and o.meal_quantity = 2
      and mi.item_type = 'side'
  $$,
  'P0001',
  'Main and side item quantities must match meal quantity',
  'Inconsistent main or side quantity cannot be persisted'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

-- Snapshot and history

select is(
  (
    select mi.unit_label
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where mi.provider_menu_item_id = 'c7777777-7777-4777-8777-777777777777'
      and ld.order_date = '2099-01-05'::date
  ),
  '1/4 LB',
  'Unit label is snapshotted into menu_items'
);

select is(
  (
    select o.special_instructions
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and o.special_instructions = 'Extra gravy on rice'
    limit 1
  ),
  'Extra gravy on rice',
  'Special instructions are saved on the order'
);

select lives_ok(
  $$
    select public.replace_order_items(
      (
        select o.id
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
          and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
          and o.special_instructions = 'Extra gravy on rice'
        limit 1
      ),
      jsonb_build_object(
        'meal_quantity', 3,
        'main_menu_item_id', (
          select mi.id
          from public.menu_items mi
          join public.lunch_days ld on ld.id = mi.lunch_day_id
          where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
            and ld.order_date = '2099-01-05'::date
            and mi.provider_menu_item_id = 'c3333333-3333-4333-8333-333333333333'
        ),
        'side_menu_item_ids', jsonb_build_array(
          (
            select mi.id
            from public.menu_items mi
            join public.lunch_days ld on ld.id = mi.lunch_day_id
            where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
              and ld.order_date = '2099-01-05'::date
              and mi.provider_menu_item_id = 'c2222222-2222-4222-8222-222222222222'
          )
        ),
        'standalone_items', jsonb_build_array(
          jsonb_build_object(
            'menu_item_id', (
              select mi.id
              from public.menu_items mi
              join public.lunch_days ld on ld.id = mi.lunch_day_id
              where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
                and ld.order_date = '2099-01-05'::date
                and mi.provider_menu_item_id = 'c5555555-5555-4555-8555-555555555555'
            ),
            'quantity', 3
          )
        )
      ),
      'Leg and thigh only'
    )
  $$,
  'Editing meal quantity updates all main and side quantities consistently'
);

select is(
  (
    select count(distinct oi.quantity)
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and o.special_instructions = 'Leg and thigh only'
      and mi.item_type in ('main', 'side')
  ),
  1::bigint,
  'Edited main and side quantities match updated meal quantity'
);

select is(
  (
    select max(oi.quantity)
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and o.special_instructions = 'Leg and thigh only'
      and mi.item_type in ('main', 'side')
  ),
  3,
  'Edited meal bundle quantity is stored on all main and side lines'
);

select is(
  (
    select o.special_instructions
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and o.special_instructions = 'Leg and thigh only'
    limit 1
  ),
  'Leg and thigh only',
  'Updated special instructions are preserved'
);

update public.provider_menu_items
set unit_label = 'Pint'
where id = 'c7777777-7777-4777-8777-777777777777';

select is(
  (
    select mi.unit_label
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where mi.provider_menu_item_id = 'c7777777-7777-4777-8777-777777777777'
      and ld.order_date = '2099-01-05'::date
  ),
  '1/4 LB',
  'Historical menu snapshots keep the original unit label'
);

select results_eq(
  $$
    select sum(oi.quantity * oi.unit_price)::numeric(10,2)
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b3333333-3333-4333-8333-333333333333'
      and o.status = 'submitted'
  $$,
  array[12.00::numeric],
  'Financial totals remain quantity times snapshotted unit price'
);

select results_eq(
  $$
    select sum(oi.quantity * oi.unit_price)::numeric(10,2)
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and o.meal_quantity = 2
      and o.status = 'submitted'
      and not exists (
        select 1
        from public.order_items oi2
        join public.menu_items mi2 on mi2.id = oi2.menu_item_id
        where oi2.order_id = o.id
          and mi2.item_type = 'standalone'
      )
  $$,
  array[35.00::numeric],
  'Financial total for meal x2 is correct'
);

select results_eq(
  $$
    select count(*)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and ld.order_date = '2099-01-05'::date
      and o.status = 'submitted'
  $$,
  array[5::bigint],
  'Multiple separate same-day orders remain valid'
);

select * from finish();
rollback;
