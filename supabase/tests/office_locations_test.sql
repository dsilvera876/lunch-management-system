begin;

select plan(31);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'a1111111-1111-4111-8111-111111111111',
  'loc-staff@test.local',
  '{"full_name":"Loc Staff"}'
),
(
  'a2222222-2222-4222-8222-222222222222',
  'loc-hr@test.local',
  '{"full_name":"Loc HR"}'
),
(
  'a3333333-3333-4333-8333-333333333333',
  'loc-admin@test.local',
  '{"full_name":"Loc Admin"}'
),
(
  'a4444444-4444-4444-8444-444444444444',
  'loc-accounts@test.local',
  '{"full_name":"Loc Accounts"}'
);

reset role;
select private.apply_profile_role('a2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('a3333333-3333-4333-8333-333333333333', 'admin');
select private.apply_profile_role('a4444444-4444-4444-8444-444444444444', 'accounts');

insert into public.lunch_providers (id, name, active)
values ('b1111111-1111-4111-8111-111111111111', 'Location Kitchen', true);

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
  ('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Loc Main', 10.00, 'main', 'Each', true),
  ('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'Loc Side', 3.00, 'side', 'Each', true),
  ('c3333333-3333-4333-8333-333333333333', 'b1111111-1111-4111-8111-111111111111', 'Loc Snack', 2.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select id, 1
from public.provider_menu_items
where provider_id = 'b1111111-1111-4111-8111-111111111111';

\ir support/open_ordering.inc

reset role;

insert into public.office_locations (id, name, address, is_active)
values
  ('d1111111-1111-4111-8111-111111111111', 'Office 1', '100 Main Street', true),
  ('d2222222-2222-4222-8222-222222222222', 'Office 2', '200 Side Avenue', true);

-- HR can create and manage locations.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    insert into public.office_locations (name, address, is_active)
    values ('Office 3', '300 Third Road', true)
  $$,
  'HR can create office locations'
);

select throws_ok(
  $$
    insert into public.office_locations (name, address, is_active)
    values (' office 1 ', 'Duplicate normalized name', true)
  $$,
  '23505',
  null,
  'Duplicate normalized office location name is rejected'
);

-- Hard delete is not allowed for authenticated management roles.

select throws_ok(
  $$
    delete from public.office_locations
    where id = 'd1111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null,
  'HR cannot hard-delete office locations'
);

-- Staff cannot manage office locations.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    insert into public.office_locations (name, is_active)
    values ('Staff Office', true)
  $$,
  '42501',
  null,
  'Staff cannot create office locations'
);

-- Accounts cannot manage office locations.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);

select results_eq(
  $$
    with updated as (
      update public.office_locations
      set name = 'Accounts Rename'
      where id = 'd1111111-1111-4111-8111-111111111111'
      returning 1
    )
    select count(*)::bigint from updated
  $$,
  array[0::bigint],
  'Accounts cannot manage office locations'
);

-- Staff can set own default through RPC.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.set_my_default_office_location('d2222222-2222-4222-8222-222222222222') $$,
  'Staff can set own default office location'
);

select throws_ok(
  $$ select public.set_my_default_office_location('d9999999-9999-4999-8999-999999999999') $$,
  'P0001',
  'Office location is invalid or inactive',
  'Staff cannot set invalid default office location'
);

reset role;
update public.office_locations
set is_active = false
where id = 'd2222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.set_my_default_office_location('d2222222-2222-4222-8222-222222222222') $$,
  'P0001',
  'Office location is invalid or inactive',
  'Inactive default location cannot be saved'
);

reset role;
update public.office_locations
set is_active = true
where id = 'd2222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.set_my_default_office_location('d2222222-2222-4222-8222-222222222222') $$,
  'Staff can restore an active default office location'
);

select lives_ok(
  $$ select public.set_my_default_office_location(null) $$,
  'Staff clears default to test required delivery location'
);

-- Orders require an active delivery location.

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
          {"provider_menu_item_id": "c3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null,
      null
    )
  $$,
  'P0001',
  'Delivery location is required',
  'Order without explicit or default location is rejected'
);

reset role;
select private.activate_trusted_profile_default_location();

update public.profiles
set default_office_location_id = null
where id = 'a1111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null,
      'd1111111-1111-4111-8111-111111111111'
    )
  $$,
  'Explicit active location succeeds without profile default'
);

select lives_ok(
  $$ select public.set_my_default_office_location('d1111111-1111-4111-8111-111111111111') $$,
  'Staff sets default to Office 1'
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null,
      null
    )
  $$,
  'Active profile default is used for new orders'
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '{
        "meal_quantity": null,
        "main_provider_menu_item_id": null,
        "side_provider_menu_item_ids": [],
        "standalone_items": [
          {"provider_menu_item_id": "c3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null,
      'd2222222-2222-4222-8222-222222222222'
    )
  $$,
  'Per-order location override succeeds'
);

select results_eq(
  $$
    select default_office_location_id
    from public.profiles
    where id = 'a1111111-1111-4111-8111-111111111111'
  $$,
  array['d1111111-1111-4111-8111-111111111111'::uuid],
  'Per-order override does not change profile default'
);

select results_eq(
  $$
    select office_location_name
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and office_location_id = 'd2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  $$,
  array['Office 2'::text],
  'Override order stores Office 2 snapshot'
);

-- Historical integrity: rename location after order.

reset role;
update public.office_locations
set name = 'Office 2 Renamed', address = 'New address'
where id = 'd2222222-2222-4222-8222-222222222222';

select results_eq(
  $$
    select office_location_name
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and office_location_id = 'd2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  $$,
  array['Office 2'::text],
  'Historical order keeps original name snapshot after rename'
);

select results_eq(
  $$
    select office_location_address
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and office_location_id = 'd2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  $$,
  array['200 Side Avenue'::text],
  'Historical order keeps original address snapshot after rename'
);

-- Order edit preserves delivery location snapshots unless explicitly changed.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.set_my_default_office_location('d1111111-1111-4111-8111-111111111111') $$,
  'Staff profile default moves to Office 1 before order edit'
);

select lives_ok(
  $$
    with target_order as (
      select
        o.id as order_id,
        mi.id as menu_item_id
      from public.orders o
      join public.lunch_days ld on ld.id = o.lunch_day_id
      join public.menu_items mi on mi.lunch_day_id = ld.id
      where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
        and o.office_location_id = 'd2222222-2222-4222-8222-222222222222'
        and mi.provider_menu_item_id = 'c3333333-3333-4333-8333-333333333333'
      order by o.created_at desc
      limit 1
    )
    select public.replace_order_items(
      (select order_id from target_order),
      jsonb_build_object(
        'meal_quantity', null,
        'main_menu_item_id', null,
        'side_menu_item_ids', '[]'::jsonb,
        'standalone_items', jsonb_build_array(
          jsonb_build_object(
            'menu_item_id', (select menu_item_id::text from target_order),
            'quantity', 2
          )
        )
      ),
      null,
      'd2222222-2222-4222-8222-222222222222'
    )
  $$,
  'Editing order items with unchanged location id succeeds'
);

select results_eq(
  $$
    select office_location_name
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and office_location_id = 'd2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  $$,
  array['Office 2'::text],
  'Editing order items preserves original location name after profile default change'
);

select results_eq(
  $$
    select office_location_address
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and office_location_id = 'd2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  $$,
  array['200 Side Avenue'::text],
  'Editing order items preserves original location address after live rename'
);

select lives_ok(
  $$
    with target_order as (
      select
        o.id as order_id,
        mi.id as menu_item_id
      from public.orders o
      join public.lunch_days ld on ld.id = o.lunch_day_id
      join public.menu_items mi on mi.lunch_day_id = ld.id
      where o.profile_id = 'a1111111-1111-4111-8111-111111111111'
        and o.office_location_id = 'd2222222-2222-4222-8222-222222222222'
        and mi.provider_menu_item_id = 'c3333333-3333-4333-8333-333333333333'
      order by o.created_at desc
      limit 1
    )
    select public.replace_order_items(
      (select order_id from target_order),
      jsonb_build_object(
        'meal_quantity', null,
        'main_menu_item_id', null,
        'side_menu_item_ids', '[]'::jsonb,
        'standalone_items', jsonb_build_array(
          jsonb_build_object(
            'menu_item_id', (select menu_item_id::text from target_order),
            'quantity', 2
          )
        )
      ),
      null,
      'd1111111-1111-4111-8111-111111111111'
    )
  $$,
  'Explicit order edit location change succeeds'
);

select results_eq(
  $$
    select office_location_id::text, office_location_name, office_location_address
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and office_location_id = 'd1111111-1111-4111-8111-111111111111'
    order by created_at desc
    limit 1
  $$,
  $$
    values (
      'd1111111-1111-4111-8111-111111111111'::text,
      'Office 1'::text,
      '100 Main Street'::text
    )
  $$,
  'Explicit order edit location change updates reference and snapshots'
);

-- Deactivate location: old orders remain, new orders reject inactive override.

reset role;
update public.office_locations
set is_active = true
where id = 'd2222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.set_my_default_office_location('d2222222-2222-4222-8222-222222222222') $$,
  'Staff sets default to inactive-bound Office 2'
);

reset role;
update public.office_locations
set is_active = false
where id = 'd2222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
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
          {"provider_menu_item_id": "c3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null,
      'd2222222-2222-4222-8222-222222222222'
    )
  $$,
  'P0001',
  'Delivery location is invalid or inactive',
  'Inactive override is rejected for new orders'
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
          {"provider_menu_item_id": "c3333333-3333-4333-8333-333333333333", "quantity": 1}
        ]
      }'::jsonb,
      null,
      null
    )
  $$,
  'P0001',
  'Delivery location is invalid or inactive',
  'Inactive profile default is rejected for new orders'
);

-- Management can read order location snapshots.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select ok(
  (
    select count(*)
    from public.orders
    where office_location_name in ('Office 1', 'Office 2')
  ) >= 1,
  'HR can read historical order location snapshots'
);

-- Export payload includes location fields.

reset role;
select public.create_first_lunch_period('Location Export Period', '2099-01-01', '2099-01-31');
select public.set_current_lunch_period(id)
from public.lunch_periods
where label = 'Location Export Period';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select ok(
  (
    select (elem ->> 'office_location_name') is not null
    from public.get_my_lunch_period_export_data() payload
    cross join lateral jsonb_array_elements(payload -> 'orders') elem
    where elem ->> 'office_location_name' = 'Office 1'
    limit 1
  ),
  'Staff export payload includes delivery location'
);

-- Meal composition still enforced with location present.

update public.office_locations
set is_active = true
where id = 'd1111111-1111-4111-8111-111111111111';

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

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
      null,
      'd1111111-1111-4111-8111-111111111111'
    )
  $$,
  'P0001',
  'A main item requires at least one side item',
  'Meal composition validation remains intact with location'
);

select * from finish();
rollback;
