begin;

select plan(4);

-- Create users
insert into auth.users (id, email, raw_user_meta_data)
values
(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'admin@test.local',
  '{"full_name":"Admin User"}'
),
(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'normal@test.local',
  '{"full_name":"Normal User"}'
);

-- Promote first user to admin
reset role;
select private.apply_profile_role('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'admin');

-- ============================================================
-- Admin tests
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    insert into public.lunch_days (
      lunch_date,
      order_deadline,
      status
    )
    values (
      current_date + 10,
      current_date + interval '10 days' + time '10:00',
      'open'
    )
  $$,
  'Admin can create lunch days'
);

select lives_ok(
  $$
    insert into public.menu_items (
      lunch_day_id,
      name,
      price
    )
    select
      id,
      'Admin Test Meal',
      15.00
    from public.lunch_days
    where lunch_date = current_date + 10
  $$,
  'Admin can create menu items'
);

-- ============================================================
-- Normal-user tests
-- ============================================================

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$
    insert into public.lunch_days (
      lunch_date,
      order_deadline,
      status
    )
    values (
      current_date + 20,
      current_date + interval '20 days',
      'open'
    )
  $$,
  '42501',
  null,
  'Normal user cannot create lunch days'
);

-- ============================================================
-- Deadline enforcement
-- ============================================================

reset role;

update public.lunch_days
set
  status = 'open',
  order_deadline = now() - interval '1 minute'
where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$
    insert into public.orders (
      profile_id,
      lunch_day_id
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'The ordering deadline has passed',
  'Orders are rejected after the deadline'
);

select * from finish();

rollback;