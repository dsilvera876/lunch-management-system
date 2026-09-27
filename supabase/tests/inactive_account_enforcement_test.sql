begin;

select plan(24);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c1111111-1111-4111-8111-111111111111', 'inactive-staff@test.local', '{"full_name":"Inactive Staff"}'),
  ('c2222222-2222-4222-8222-222222222222', 'inactive-hr@test.local', '{"full_name":"Inactive HR"}'),
  ('c3333333-3333-4333-8333-333333333333', 'inactive-acc@test.local', '{"full_name":"Inactive Accounts"}'),
  ('c4444444-4444-4444-8444-444444444444', 'inactive-adm@test.local', '{"full_name":"Inactive Admin"}'),
  ('c5555555-5555-4555-8555-555555555555', 'active-hr@test.local', '{"full_name":"Active HR"}');

reset role;

select private.apply_profile_role('c2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('c3333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('c4444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('c5555555-5555-4555-8555-555555555555', 'hr');

-- ============================================================
-- Direct profile account_status mutation blocked
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.profiles set account_status = 'inactive' where id = 'c1111111-1111-4111-8111-111111111111' $$,
  'P0001',
  'Account status changes must use HR staff account management',
  'active staff cannot self-deactivate via profiles update'
);

reset role;

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'c1111111-1111-4111-8111-111111111111';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.profiles set account_status = 'active' where id = 'c1111111-1111-4111-8111-111111111111' $$,
  'inactive self-reactivate update is a no-op under RLS'
);

reset role;

select is(
  (select account_status from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
  'inactive',
  'inactive staff cannot self-reactivate via profiles update'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$
    select set_config('app.account_status_change_gate', 'guess', true);
    update public.profiles set account_status = 'active' where id = 'c1111111-1111-4111-8111-111111111111';
  $$,
  'guessed gate update attempt is a no-op under RLS'
);

reset role;

select is(
  (select account_status from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
  'inactive',
  'guessed account_status_change_gate cannot bypass guard'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select private.activate_trusted_account_status_change() $$,
  '42501',
  null,
  'authenticated cannot activate trusted account status gate'
);

-- ============================================================
-- Trusted HR RPC can change status
-- ============================================================

reset role;

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'active' where id = 'c1111111-1111-4111-8111-111111111111';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_staff_active_status('c1111111-1111-4111-8111-111111111111', 'inactive') $$,
  'HR RPC can deactivate staff'
);

select lives_ok(
  $$ select public.set_staff_active_status('c1111111-1111-4111-8111-111111111111', 'active') $$,
  'HR RPC can reactivate staff'
);

-- ============================================================
-- Order mutations blocked for inactive JWT
-- ============================================================

reset role;

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'active' where id = 'c1111111-1111-4111-8111-111111111111';
select private.deactivate_trusted_account_status_change();

insert into public.lunch_providers (id, name, active)
values ('c6111111-1111-4111-8111-111111111111', 'Inactive Test Kitchen', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values ('c6222222-2222-4222-8222-222222222222', 'c6111111-1111-4111-8111-111111111111', 'Meal', 10.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('c6222222-2222-4222-8222-222222222222', 1);

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'c6111111-1111-4111-8111-111111111111',
  '2099-03-02'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"c6222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
  null
);

reset role;

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'c1111111-1111-4111-8111-111111111111';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.submit_provider_order(
    'c6111111-1111-4111-8111-111111111111',
    '2099-03-09'::date,
    '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"c6222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
    null
  ) $$,
  'P0001',
  'Authentication required',
  'inactive staff cannot submit orders'
);

select throws_ok(
  $$ select public.cancel_order(
    (select id from public.orders where profile_id = 'c1111111-1111-4111-8111-111111111111' limit 1)
  ) $$,
  'P0001',
  'Authentication required',
  'inactive staff cannot cancel orders'
);

select throws_ok(
  $$ select public.replace_order_items(
    (select id from public.orders where profile_id = 'c1111111-1111-4111-8111-111111111111' limit 1),
    '[{"menu_item_id":"20000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb
  ) $$,
  'P0001',
  'Authentication required',
  'inactive staff cannot edit orders'
);

select throws_ok(
  $$ select public.set_my_default_office_location(null) $$,
  'P0001',
  'Authentication required',
  'inactive staff cannot update default office location'
);

select is(
  (select count(*)::int from public.orders),
  0,
  'inactive staff direct SELECT on orders returns no own rows'
);

select is(
  (select count(*)::int from public.order_items),
  0,
  'inactive staff direct SELECT on order_items returns no own rows'
);

-- ============================================================
-- Privileged inactive roles
-- ============================================================

reset role;

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'c2222222-2222-4222-8222-222222222222';
update public.profiles set account_status = 'inactive' where id = 'c3333333-3333-4333-8333-333333333333';
update public.profiles set account_status = 'inactive' where id = 'c4444444-4444-4444-8444-444444444444';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Authentication required',
  'inactive HR cannot call HR directory RPC'
);

select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu(
    'c6111111-1111-4111-8111-111111111111',
    '2099-03-03'::date
  ) $$,
  'P0001',
  'Authentication required',
  'inactive HR cannot fetch late-order snapshot menu'
);

select throws_ok(
  $$ select public.create_hr_late_order(
    'c1111111-1111-4111-8111-111111111111',
    'c6111111-1111-4111-8111-111111111111',
    '2099-03-03'::date,
    '[]'::jsonb
  ) $$,
  'P0001',
  'Authentication required',
  'inactive HR cannot create late orders'
);

select throws_ok(
  $$ select public.claim_provider_late_order_supplement(
    'c6111111-1111-4111-8111-111111111111',
    '2099-03-03'::date
  ) $$,
  'P0001',
  'Authentication required',
  'inactive HR cannot claim late-order supplement dispatch'
);

select set_config('request.jwt.claims', json_build_object('sub', 'c3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_employee_id_directory() $$,
  'P0001',
  'Authentication required',
  'inactive Accounts cannot call Employee ID directory RPC'
);

select set_config('request.jwt.claims', json_build_object('sub', 'c4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.list_manageable_users() $$,
  'P0001',
  'Authentication required',
  'inactive Admin cannot call Admin role-management RPC'
);

reset role;

insert into public.lunch_providers (id, name, active)
values ('c7111111-1111-4111-8111-111111111111', 'Inactive Admin Delete Target', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.delete_unused_lunch_provider('c7111111-1111-4111-8111-111111111111') $$,
  'P0001',
  'Authentication required',
  'inactive Admin cannot delete unused lunch providers'
);

-- ============================================================
-- Reactivation restores self-read access
-- ============================================================

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_staff_active_status('c1111111-1111-4111-8111-111111111111', 'active') $$,
  'HR RPC can reactivate staff for self-read test'
);

select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  (select count(*)::int from public.orders) >= 1,
  'reactivated staff direct SELECT on orders returns own rows again'
);

select ok(
  (select count(*)::int from public.order_items) >= 1,
  'reactivated staff direct SELECT on order_items returns own rows again'
);

select * from finish();
rollback;
