begin;

select plan(23);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'd1111111-1111-4111-8111-111111111111',
  'order-admin@test.local',
  '{"full_name":"Order Admin"}'
),
(
  'd2222222-2222-4222-8222-222222222222',
  'order-user@test.local',
  '{"full_name":"Order User"}'
);

reset role;
select private.apply_profile_role('d1111111-1111-4111-8111-111111111111', 'admin');

-- ============================================================
-- Default cutoff and admin settings
-- ============================================================

select results_eq(
  $$ select order_cutoff_time::text from public.app_settings where id = 1 $$,
  array['16:00:00'::text],
  'Default order cutoff is 16:00 Jamaica time'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    update public.app_settings
    set order_cutoff_time = '15:30:00'
    where id = 1
  $$,
  'Admin can change the global order cutoff'
);

select results_eq(
  $$
    select to_char(
      public.order_deadline_for_order_date('2099-01-05'::date) at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
  $$,
  array['15:30:00'::text],
  'Updated cutoff is reflected in order deadlines'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$
    with updated as (
      update public.app_settings
      set order_cutoff_time = '09:00:00'
      where id = 1
      returning 1
    )
    select count(*) from updated
  $$,
  array[0::bigint],
  'Normal user cannot change the order cutoff'
);

reset role;

-- Provider ordering sections below use far-future order dates so tests do
-- not depend on the real wall clock relative to the 16:00 business cutoff.

-- ============================================================
-- Provider and recurring menu setup
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

insert into public.lunch_providers (id, name, active)
values
(
  'e1111111-1111-4111-8111-111111111111',
  'Order Test Kitchen',
  true
),
(
  'e2222222-2222-4222-8222-222222222222',
  'Second Provider',
  true
);

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
(
  'f1111111-1111-4111-8111-111111111111',
  'e1111111-1111-4111-8111-111111111111',
  'Fried Chicken',
  12.00,
  'main',
  'Each',
  true
),
(
  'f2222222-2222-4222-8222-222222222222',
  'e1111111-1111-4111-8111-111111111111',
  'Rice and Peas',
  11.00,
  'side',
  'Each',
  true
),
(
  'f3333333-3333-4333-8333-333333333333',
  'e2222222-2222-4222-8222-222222222222',
  'Orange Juice',
  3.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (
  provider_menu_item_id,
  weekday
)
values
  ('f1111111-1111-4111-8111-111111111111', 1),
  ('f2222222-2222-4222-8222-222222222222', 1),
  ('f3333333-3333-4333-8333-333333333333', 1);

reset role;

select is_empty(
  $$
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'one_active_order_per_user_per_lunch_day'
  $$,
  'Per-user lunch day order uniqueness index is removed'
);

\ir support/open_ordering.inc

-- 2099-01-05 is a Monday; delivery date is 2099-01-06 (Tuesday).

-- ============================================================
-- Multiple orders for same employee and delivery date
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select public.submit_provider_order(
  'e1111111-1111-4111-8111-111111111111',
  '2099-01-05'::date,
  '{"meal_quantity":2,"main_provider_menu_item_id":"f1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["f2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  null
);

select public.submit_provider_order(
  'e1111111-1111-4111-8111-111111111111',
  '2099-01-05'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"f1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["f2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  null
);

select public.submit_provider_order(
  'e2222222-2222-4222-8222-222222222222',
  '2099-01-05'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"f3333333-3333-4333-8333-333333333333","quantity":2}]}'::jsonb,
  null
);

select results_eq(
  $$
    select count(*)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
      and o.status = 'submitted'
      and ld.lunch_date = '2099-01-06'::date
  $$,
  array[3::bigint],
  'Employee can submit multiple orders for the same delivery date'
);

select results_eq(
  $$
    select count(*)
    from (
      select id
      from public.orders
      where profile_id = 'd2222222-2222-4222-8222-222222222222'
        and status = 'submitted'
      group by id
    ) distinct_orders
  $$,
  array[3::bigint],
  'Same-provider and cross-provider orders remain separately identifiable'
);

select results_eq(
  $$
    select quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
      and mi.provider_menu_item_id = 'f2222222-2222-4222-8222-222222222222'
      and oi.quantity > 1
    order by o.created_at
    limit 1
  $$,
  array[2],
  'Quantity greater than one is stored on an order item'
);

select results_eq(
  $$
    select count(distinct lunch_day_id)
    from public.orders
    where profile_id = 'd2222222-2222-4222-8222-222222222222'
      and status = 'submitted'
      and lunch_day_id in (
        select id
        from public.lunch_days
        where provider_id = 'e1111111-1111-4111-8111-111111111111'
          and order_date = '2099-01-05'::date
      )
  $$,
  array[1::bigint],
  'Multiple orders can reference the same generated provider cycle'
);

select throws_like(
  $$
    select public.submit_provider_order(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"f3333333-3333-4333-8333-333333333333","quantity":1}]}'::jsonb,
      null
    )
  $$,
  '%Menu item % for provider % is invalid or inactive%',
  'Mixed-provider items within one order are rejected'
);

-- ============================================================
-- Independent edit, cancel, and fulfill behavior
-- ============================================================

select lives_ok(
  $$
    select public.replace_order_items(
      (
        select o.id
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        join public.menu_items mi on mi.id = oi.menu_item_id
        where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
          and mi.provider_menu_item_id = 'f1111111-1111-4111-8111-111111111111'
        order by o.created_at
        limit 1
      ),
      (
        select jsonb_build_object(
          'meal_quantity', 3,
          'main_menu_item_id', (
            select mi.id
            from public.menu_items mi
            join public.lunch_days ld on ld.id = mi.lunch_day_id
            where ld.provider_id = 'e1111111-1111-4111-8111-111111111111'
              and ld.order_date = '2099-01-05'::date
              and mi.provider_menu_item_id = 'f1111111-1111-4111-8111-111111111111'
          ),
          'side_menu_item_ids', jsonb_build_array(
            (
              select mi.id
              from public.menu_items mi
              join public.lunch_days ld on ld.id = mi.lunch_day_id
              where ld.provider_id = 'e1111111-1111-4111-8111-111111111111'
                and ld.order_date = '2099-01-05'::date
                and mi.provider_menu_item_id = 'f2222222-2222-4222-8222-222222222222'
            )
          ),
          'standalone_items', '[]'::jsonb
        )
      ),
      null
    )
  $$,
  'Editing one order does not require touching other orders'
);

select results_eq(
  $$
    select oi.quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
      and mi.provider_menu_item_id = 'f2222222-2222-4222-8222-222222222222'
      and o.meal_quantity = 1
      and o.status = 'submitted'
    order by o.created_at
    limit 1
  $$,
  array[1],
  'Editing one order does not alter another order'
);

reset role;

reset role;
select private.apply_profile_role('d1111111-1111-4111-8111-111111111111', 'admin');

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select public.fulfill_order(
      (
        select o.id
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        join public.menu_items mi on mi.id = oi.menu_item_id
        where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
          and mi.provider_menu_item_id = 'f1111111-1111-4111-8111-111111111111'
        order by o.created_at
        limit 1
      )
    )
  $$,
  'Admin can fulfill one order independently'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{"meal_quantity":1,"main_provider_menu_item_id":"f1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["f2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
      null
    )
  $$,
  'Fulfilling one order does not prevent additional orders before cutoff'
);

select throws_ok(
  $$
    select public.replace_order_items(
      (
        select o.id
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        join public.menu_items mi on mi.id = oi.menu_item_id
        where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
          and mi.provider_menu_item_id = 'f1111111-1111-4111-8111-111111111111'
          and o.status = 'fulfilled'
        limit 1
      ),
      (
        select jsonb_build_object(
          'meal_quantity', 1,
          'main_menu_item_id', (
            select mi.id
            from public.menu_items mi
            join public.lunch_days ld on ld.id = mi.lunch_day_id
            where ld.provider_id = 'e1111111-1111-4111-8111-111111111111'
              and ld.order_date = '2099-01-05'::date
              and mi.provider_menu_item_id = 'f1111111-1111-4111-8111-111111111111'
          ),
          'side_menu_item_ids', jsonb_build_array(
            (
              select mi.id
              from public.menu_items mi
              join public.lunch_days ld on ld.id = mi.lunch_day_id
              where ld.provider_id = 'e1111111-1111-4111-8111-111111111111'
                and ld.order_date = '2099-01-05'::date
                and mi.provider_menu_item_id = 'f2222222-2222-4222-8222-222222222222'
            )
          ),
          'standalone_items', '[]'::jsonb
        )
      ),
      null
    )
  $$,
  'P0001',
  'Only submitted orders can be edited',
  'Fulfilled orders remain immutable'
);

select lives_ok(
  $$
    select public.cancel_order(
      (
        select o.id
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        join public.menu_items mi on mi.id = oi.menu_item_id
        where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
          and mi.provider_menu_item_id = 'f2222222-2222-4222-8222-222222222222'
          and o.status = 'submitted'
        limit 1
      )
    )
  $$,
  'Employee can cancel one order independently'
);

select results_eq(
  $$
    select count(*)
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.profile_id = 'd2222222-2222-4222-8222-222222222222'
      and mi.provider_menu_item_id = 'f3333333-3333-4333-8333-333333333333'
      and o.status = 'submitted'
  $$,
  array[1::bigint],
  'Cancelling one order does not cancel another order'
);

-- ============================================================
-- Snapshot stability and deactivation rules
-- ============================================================

reset role;

update public.provider_menu_items
set name = 'Renamed Chicken', price = 99.00
where id = 'f2222222-2222-4222-8222-222222222222';

select is(
  (
    select mi.name || '|' || mi.price::text
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where mi.provider_menu_item_id = 'f2222222-2222-4222-8222-222222222222'
      and ld.lunch_date = '2099-01-06'::date
  ),
  'Rice and Peas|11.00',
  'Snapshotted menu items remain stable after recurring menu edits'
);

update public.provider_menu_items
set active = false
where id = 'f1111111-1111-4111-8111-111111111111';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select throws_like(
  $$
    select public.submit_provider_order(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{"meal_quantity":1,"main_provider_menu_item_id":"f1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["f2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
      null
    )
  $$,
  '%Menu item % for provider % is invalid or inactive%',
  'Deactivated recurring items are blocked from new submissions'
);

reset role;

update public.provider_menu_items
set active = true
where id = 'f1111111-1111-4111-8111-111111111111';

reset role;

update public.lunch_providers
set active = false
where id = 'e1111111-1111-4111-8111-111111111111';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'e1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{"meal_quantity":1,"main_provider_menu_item_id":"f1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["f2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
      null
    )
  $$,
  'P0001',
  'Provider is not available',
  'Inactive providers are blocked from new orders'
);

-- ============================================================
-- Cutoff enforcement
-- ============================================================

reset role;

update public.lunch_providers
set active = true
where id = 'e1111111-1111-4111-8111-111111111111';

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'd2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'e2222222-2222-4222-8222-222222222222',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"f3333333-3333-4333-8333-333333333333","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'Ordering before the cutoff succeeds'
);

reset role;

update public.app_settings
set order_cutoff_time = '00:00:00'
where id = 1;

select throws_ok(
  $$
    select public.submit_provider_order(
      'e2222222-2222-4222-8222-222222222222',
      '2020-01-06'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"f3333333-3333-4333-8333-333333333333","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'P0001',
  'The ordering deadline has passed',
  'Ordering after the cutoff fails'
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'e1111111-1111-4111-8111-111111111111',
      '2026-09-12'::date,
      '{"meal_quantity":1,"main_provider_menu_item_id":"f1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["f2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
      null
    )
  $$,
  'P0001',
  'Ordering is not available on weekends',
  'Weekend ordering is rejected'
);

select * from finish();

rollback;
