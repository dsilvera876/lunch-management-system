begin;

select plan(59);

-- ============================================================
-- Users
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'staff@test.local', '{"full_name":"Staff User"}'),
  ('22222222-2222-4222-8222-222222222222', 'hr@test.local', '{"full_name":"HR User"}'),
  ('33333333-3333-4333-8333-333333333333', 'accounts@test.local', '{"full_name":"Accounts User"}'),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.local', '{"full_name":"Admin User"}'),
  ('55555555-5555-4555-8555-555555555555', 'owner@test.local', '{"full_name":"Owner User"}'),
  ('66666666-6666-4666-8666-666666666666', 'admin2@test.local', '{"full_name":"Admin Two"}'),
  ('77777777-7777-4777-8777-777777777777', 'staff2@test.local', '{"full_name":"Staff Two"}');

reset role;

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('66666666-6666-4666-8666-666666666666', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'owner');

-- Provider fixture
insert into public.lunch_providers (id, name, active)
values ('88888888-8888-4888-8888-888888888888', 'Role Test Provider', true);

-- ============================================================
-- Core roles
-- ============================================================

select throws_ok(
  $$ select private.apply_profile_role('11111111-1111-4111-8111-111111111111', 'user') $$,
  '23514',
  null,
  'Legacy user role is rejected'
);

select results_eq(
  $$ select role from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  array['staff'::text],
  'New profiles default to staff'
);

select results_eq(
  $$ select role from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  array['owner'::text],
  'Owner is a valid role'
);

select throws_ok(
  $$ select private.apply_profile_role('66666666-6666-4666-8666-666666666666', 'owner') $$,
  '23505',
  null,
  'Database prevents a second Owner'
);

-- ============================================================
-- Provider / menu permissions
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.lunch_providers (name, active) values ('Staff Provider', true) $$,
  '42501',
  null,
  'Staff cannot manage providers'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.lunch_providers set description = 'HR updated' where id = '88888888-8888-4888-8888-888888888888' $$,
  'HR can manage providers'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    with updated as (
      update public.lunch_providers
      set description = 'Accounts blocked'
      where id = '88888888-8888-4888-8888-888888888888'
      returning 1
    )
    select count(*)::bigint from updated
  $$,
  array[0::bigint],
  'Accounts cannot manage providers'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.lunch_providers set description = 'Admin updated' where id = '88888888-8888-4888-8888-888888888888' $$,
  'Admin can manage providers'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.lunch_providers set description = 'Owner updated' where id = '88888888-8888-4888-8888-888888888888' $$,
  'Owner can manage providers'
);

-- ============================================================
-- Cutoff
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.app_settings set order_cutoff_time = '15:30:00' where id = 1 $$,
  'HR can change cutoff'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    with updated as (
      update public.app_settings
      set order_cutoff_time = '15:00:00'
      where id = 1
      returning 1
    )
    select count(*)::bigint from updated
  $$,
  array[0::bigint],
  'Accounts cannot change cutoff'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    with updated as (
      update public.app_settings
      set order_cutoff_time = '14:00:00'
      where id = 1
      returning 1
    )
    select count(*)::bigint from updated
  $$,
  array[0::bigint],
  'Staff cannot change cutoff'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.app_settings set order_cutoff_time = '16:00:00' where id = 1 $$,
  'Admin can change cutoff'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.app_settings set order_cutoff_time = '16:30:00' where id = 1 $$,
  'Owner can change cutoff'
);

-- ============================================================
-- Orders for visibility / fulfillment fixtures
-- ============================================================

reset role;

\ir support/legacy_lunch_day_fixture.inc

insert into public.orders (id, profile_id, lunch_day_id, status)
values
  ('99999999-9999-4999-8999-999999999901', '11111111-1111-4111-8111-111111111111', '10000000-0000-0000-0000-000000000001', 'submitted'),
  ('99999999-9999-4999-8999-999999999902', '77777777-7777-4777-8777-777777777777', '10000000-0000-0000-0000-000000000001', 'submitted');

-- ============================================================
-- Order visibility
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*) from public.orders $$,
  array[1::bigint],
  'Staff sees own orders only'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*) from public.orders $$,
  array[2::bigint],
  'HR can view all orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*) from public.orders $$,
  array[2::bigint],
  'Accounts can view all orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*) from public.orders $$,
  array[2::bigint],
  'Admin can view all orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*) from public.orders $$,
  array[2::bigint],
  'Owner can view all orders'
);

-- ============================================================
-- Fulfillment
-- ============================================================

select lives_ok(
  $$ select public.fulfill_order('99999999-9999-4999-8999-999999999902') $$,
  'Owner can fulfill'
);

reset role;
update public.orders set status = 'submitted' where id = '99999999-9999-4999-8999-999999999902';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.fulfill_order('99999999-9999-4999-8999-999999999902') $$,
  'HR can fulfill'
);

reset role;
update public.orders set status = 'submitted' where id = '99999999-9999-4999-8999-999999999902';

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.fulfill_order('99999999-9999-4999-8999-999999999902') $$,
  'P0001',
  'Fulfillment access required',
  'Accounts cannot fulfill'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.fulfill_order('99999999-9999-4999-8999-999999999902') $$,
  'P0001',
  'Fulfillment access required',
  'Staff cannot fulfill'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.fulfill_order('99999999-9999-4999-8999-999999999902') $$,
  'Admin can fulfill'
);

-- ============================================================
-- Normal role management
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'staff') $$,
  'Admin can assign Staff'
);

select lives_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'hr') $$,
  'Admin can assign HR'
);

select lives_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'accounts') $$,
  'Admin can assign Accounts'
);

select lives_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'admin') $$,
  'Admin can assign Admin'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'staff') $$,
  'Owner can assign normal roles'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'staff') $$,
  'P0001',
  'Role management access required',
  'HR cannot change roles'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'staff') $$,
  'P0001',
  'Role management access required',
  'Accounts cannot change roles'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('77777777-7777-4777-8777-777777777777', 'staff') $$,
  'P0001',
  'Role management access required',
  'Staff cannot change roles'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111' $$,
  'P0001',
  'Role changes must use assign_user_role or transfer_ownership',
  'Users cannot self-promote through normal profile updates'
);

-- ============================================================
-- Owner protections
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('55555555-5555-4555-8555-555555555555', 'admin') $$,
  'P0001',
  'Owner role cannot be changed through role assignment',
  'Admin cannot demote Owner through role assignment'
);

select throws_ok(
  $$ select public.assign_user_role('55555555-5555-4555-8555-555555555555', 'owner') $$,
  'P0001',
  'Invalid assignable role',
  'Admin cannot assign Owner'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('55555555-5555-4555-8555-555555555555', 'owner') $$,
  'P0001',
  'Role management access required',
  'HR cannot assign Owner'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('55555555-5555-4555-8555-555555555555', 'owner') $$,
  'P0001',
  'Role management access required',
  'Accounts cannot assign Owner'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('55555555-5555-4555-8555-555555555555', 'owner') $$,
  'P0001',
  'Role management access required',
  'Staff cannot assign Owner'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.assign_user_role('55555555-5555-4555-8555-555555555555', 'admin') $$,
  'P0001',
  'Owner role cannot be changed through role assignment',
  'Current Owner cannot demote themselves through normal role assignment'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '55555555-5555-4555-8555-555555555555' $$,
  'P0001',
  'Owner role can only change through ownership transfer',
  'Current Owner cannot be directly demoted by Admin'
);

select throws_ok(
  $$ delete from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  'P0001',
  'Owner profile cannot be deleted',
  'Current Owner cannot be deleted through normal profile-management paths'
);

-- ============================================================
-- Ownership transfer
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.transfer_ownership('66666666-6666-4666-8666-666666666666') $$,
  'Owner can transfer ownership'
);

select results_eq(
  $$ select role from public.profiles where id = '66666666-6666-4666-8666-666666666666' $$,
  array['owner'::text],
  'Transfer promotes target to Owner'
);

select results_eq(
  $$ select role from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  array['admin'::text],
  'Transfer demotes former Owner to Admin'
);

select results_eq(
  $$ select count(*) from public.profiles where role = 'owner' $$,
  array[1::bigint],
  'Only one Owner exists after transfer'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.transfer_ownership('77777777-7777-4777-8777-777777777777') $$,
  'P0001',
  'Only the current Owner may transfer ownership',
  'Admin cannot transfer ownership'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.transfer_ownership('77777777-7777-4777-8777-777777777777') $$,
  'P0001',
  'Only the current Owner may transfer ownership',
  'HR cannot transfer ownership'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.transfer_ownership('77777777-7777-4777-8777-777777777777') $$,
  'P0001',
  'Only the current Owner may transfer ownership',
  'Accounts cannot transfer ownership'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.transfer_ownership('77777777-7777-4777-8777-777777777777') $$,
  'P0001',
  'Only the current Owner may transfer ownership',
  'Staff cannot transfer ownership'
);

select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.transfer_ownership('66666666-6666-4666-8666-666666666666') $$,
  'P0001',
  'Cannot transfer ownership to yourself',
  'Transfer to self rejected'
);

select throws_ok(
  $$ select public.transfer_ownership('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'P0001',
  'Target profile does not exist',
  'Transfer to nonexistent user rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.transfer_ownership('77777777-7777-4777-8777-777777777777') $$,
  'P0001',
  'Only the current Owner may transfer ownership',
  'Former Owner loses Owner-only transfer privilege'
);

select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.transfer_ownership('55555555-5555-4555-8555-555555555555') $$,
  'New Owner can subsequently transfer ownership'
);

-- ============================================================
-- Personal ordering
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

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
  'Staff can place own lunch orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

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
  'HR can place own lunch orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

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
  'Accounts can place own lunch orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

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
  'Admin can place own lunch orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

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
  'Owner can place own lunch orders'
);

select results_eq(
  $$ select count(*) from public.lunch_providers where active = true $$,
  array[1::bigint],
  'All authenticated roles can read active provider data needed for personal ordering'
);

select * from finish();
rollback;
