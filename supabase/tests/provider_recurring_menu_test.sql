begin;

select plan(15);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'a1111111-1111-4111-8111-111111111111',
  'provider-admin@test.local',
  '{"full_name":"Provider Admin"}'
),
(
  'a2222222-2222-4222-8222-222222222222',
  'provider-user@test.local',
  '{"full_name":"Provider User"}'
);

update public.profiles
set role = 'admin'
where id = 'a1111111-1111-4111-8111-111111111111';

-- ============================================================
-- Admin provider CRUD
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    insert into public.lunch_providers (id, name, description, active)
    values (
      'b1111111-1111-4111-8111-111111111111',
      'Test Kitchen',
      'Recurring menu provider',
      true
    )
  $$,
  'Admin can create a lunch provider'
);

select lives_ok(
  $$
    update public.lunch_providers
    set description = 'Updated provider description'
    where id = 'b1111111-1111-4111-8111-111111111111'
  $$,
  'Admin can update a lunch provider'
);

select lives_ok(
  $$
    insert into public.provider_menu_items (
      id,
      provider_id,
      name,
      price,
      active
    )
    values (
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      'Fried Chicken',
      12.00,
      true
    )
  $$,
  'Admin can create a recurring provider menu item'
);

select throws_ok(
  $$
    insert into public.provider_menu_items (
      provider_id,
      name,
      price
    )
    values (
      'b1111111-1111-4111-8111-111111111111',
      'fried chicken',
      12.50
    )
  $$,
  '23505',
  null,
  'Duplicate normalized menu item name rejected for same provider'
);

select lives_ok(
  $$
    insert into public.lunch_providers (id, name, active)
    values (
      'b2222222-2222-4222-8222-222222222222',
      'Second Kitchen',
      true
    )
  $$,
  'Admin can create second provider for cross-provider name test'
);

select lives_ok(
  $$
    insert into public.provider_menu_items (
      provider_id,
      name,
      price
    )
    values (
      'b2222222-2222-4222-8222-222222222222',
      'fried chicken',
      13.00
    )
  $$,
  'Same normalized menu item name allowed for different provider'
);

select lives_ok(
  $$
    insert into public.provider_menu_item_weekdays (
      provider_menu_item_id,
      weekday
    )
    values
      ('c1111111-1111-4111-8111-111111111111', 1),
      ('c1111111-1111-4111-8111-111111111111', 2),
      ('c1111111-1111-4111-8111-111111111111', 3),
      ('c1111111-1111-4111-8111-111111111111', 4),
      ('c1111111-1111-4111-8111-111111111111', 5)
  $$,
  'Admin can assign weekdays to a recurring menu item'
);

select throws_ok(
  $$
    insert into public.provider_menu_item_weekdays (
      provider_menu_item_id,
      weekday
    )
    values (
      'c1111111-1111-4111-8111-111111111111',
      6
    )
  $$,
  '23514',
  null,
  'Invalid weekday values are rejected'
);

-- ============================================================
-- Normal user restrictions
-- ============================================================

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$
    insert into public.lunch_providers (name)
    values ('Unauthorized Provider')
  $$,
  '42501',
  null,
  'Normal user cannot create providers'
);

select throws_ok(
  $$
    insert into public.provider_menu_items (
      provider_id,
      name,
      price
    )
    values (
      'b1111111-1111-4111-8111-111111111111',
      'Curry Chicken',
      11.00
    )
  $$,
  '42501',
  null,
  'Normal user cannot create provider menu items'
);

select results_eq(
  $$
    select count(*)
    from public.lunch_providers
    where id = 'b1111111-1111-4111-8111-111111111111'
  $$,
  array[1::bigint],
  'Normal user can read active providers'
);

select results_eq(
  $$
    select count(*)
    from public.provider_menu_items
    where id = 'c1111111-1111-4111-8111-111111111111'
  $$,
  array[1::bigint],
  'Normal user can read active provider menu items'
);

reset role;

update public.lunch_providers
set active = false
where id = 'b1111111-1111-4111-8111-111111111111';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$
    select count(*)
    from public.lunch_providers
    where id = 'b1111111-1111-4111-8111-111111111111'
  $$,
  array[0::bigint],
  'Normal user cannot read inactive providers'
);

-- ============================================================
-- Next business weekday helper
-- ============================================================

reset role;

select results_eq(
  $$ select public.next_business_weekday(1::smallint) $$,
  array[2::smallint],
  'Monday order maps to Tuesday delivery weekday'
);

select results_eq(
  $$ select public.next_business_weekday(5::smallint) $$,
  array[1::smallint],
  'Friday order maps to Monday delivery weekday'
);

select * from finish();

rollback;
