begin;

select plan(26);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'sam-staff@test.local', '{"full_name":"Sam Staff"}'),
  ('a2222222-2222-4222-8222-222222222222', 'har-hr@test.local', '{"full_name":"Har HR"}'),
  ('a3333333-3333-4333-8333-333333333333', 'acc-accounts@test.local', '{"full_name":"Acc Accounts"}'),
  ('a4444444-4444-4444-8444-444444444444', 'adm-admin@test.local', '{"full_name":"Adm Admin"}'),
  ('a5555555-5555-4555-8555-555555555555', 'own-owner@test.local', '{"full_name":"Own Owner"}'),
  ('a6666666-6666-4666-8666-666666666666', 'pat-staff2@test.local', '{"full_name":"Pat Staff Two"}');

reset role;

select private.apply_profile_role('a2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('a3333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('a4444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('a5555555-5555-4555-8555-555555555555', 'owner');

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.set_employee_id('a1111111-1111-4111-8111-111111111111', '0054');

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('Sam', null, null, 50, 0) $$,
  array[1::bigint],
  'HR directory search by name'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('sam-staff@test', null, null, 50, 0) $$,
  array[1::bigint],
  'HR directory search by email'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('0054', null, null, 50, 0) $$,
  array[1::bigint],
  'HR directory search by Employee ID'
);

select lives_ok(
  $$ select public.update_staff_name('a6666666-6666-4666-8666-666666666666', 'Patricia Staff') $$,
  'HR can update staff name'
);

select lives_ok(
  $$ select public.set_employee_id('a6666666-6666-4666-8666-666666666666', '1123') $$,
  'HR can set Employee ID from directory workflow'
);

select lives_ok(
  $$ select public.set_staff_active_status('a6666666-6666-4666-8666-666666666666', 'inactive') $$,
  'HR can deactivate staff'
);

select lives_ok(
  $$ select public.set_staff_active_status('a6666666-6666-4666-8666-666666666666', 'active') $$,
  'HR can reactivate staff'
);

select throws_ok(
  $$ select public.assign_user_role('a6666666-6666-4666-8666-666666666666', 'admin') $$,
  'P0001',
  'Role management access required',
  'HR cannot change role through assign_user_role'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::bigint from public.search_employee_id_directory('1123', 50, 0) $$,
  array[1::bigint],
  'Accounts can search Employee ID directory'
);

select lives_ok(
  $$ select public.set_employee_id('a6666666-6666-4666-8666-666666666666', '2097') $$,
  'Accounts can edit Employee ID'
);

select throws_ok(
  $$ select public.update_staff_name('a1111111-1111-4111-8111-111111111111', 'Blocked Name') $$,
  'P0001',
  'Staff account management access required',
  'Accounts cannot edit staff name'
);

select throws_ok(
  $$ select public.set_staff_active_status('a1111111-1111-4111-8111-111111111111', 'inactive') $$,
  'P0001',
  'Staff account management access required',
  'Accounts cannot deactivate staff'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'Admin cannot access HR staff directory'
);

select throws_ok(
  $$ select 1 from public.search_employee_id_directory() $$,
  'P0001',
  'Employee ID directory access required',
  'Admin cannot access Employee ID directory'
);

select lives_ok(
  $$ select 1 from public.list_manageable_users() limit 1 $$,
  'Admin role management still works'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_employee_id_directory() $$,
  'P0001',
  'Employee ID directory access required',
  'Owner cannot access Employee ID directory'
);

select lives_ok(
  $$ select 1 from public.list_manageable_users() limit 1 $$,
  'Owner role management still works'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'Staff cannot access HR directory'
);

select throws_ok(
  $$ select 1 from public.search_employee_id_directory() $$,
  'P0001',
  'Employee ID directory access required',
  'Staff cannot access Employee ID directory'
);

-- Inactive enforcement
reset role;

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'a1111111-1111-4111-8111-111111111111';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_my_financial_dashboard() $$,
  'P0001',
  'Authentication required',
  'inactive staff cannot use staff financial RPC'
);

reset role;

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'a2222222-2222-4222-8222-222222222222';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Authentication required',
  'inactive HR cannot use HR RPCs'
);

reset role;

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'active' where id = 'a2222222-2222-4222-8222-222222222222';
update public.profiles set account_status = 'inactive' where id = 'a3333333-3333-4333-8333-333333333333';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_employee_id_directory() $$,
  'P0001',
  'Authentication required',
  'inactive Accounts cannot use Employee ID RPCs'
);

reset role;

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'active' where id = 'a3333333-3333-4333-8333-333333333333';
update public.profiles set account_status = 'inactive' where id = 'a4444444-4444-4444-8444-444444444444';
select private.deactivate_trusted_account_status_change();

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.list_manageable_users() $$,
  'P0001',
  'Authentication required',
  'inactive Admin cannot use Admin RPCs'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.set_staff_active_status('a5555555-5555-4555-8555-555555555555', 'inactive') $$,
  'P0001',
  'Owner accounts cannot be deactivated through this workflow',
  'HR cannot deactivate Owner'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.set_employee_id('a6666666-6666-4666-8666-666666666666', '0054') $$,
  'P0001',
  'Employee ID 0054 is already assigned to another user',
  'duplicate Employee ID returns friendly message'
);

select throws_ok(
  $$ select employee_id from public.list_manageable_users() limit 1 $$,
  '42703',
  null,
  'Admin user management payload still excludes employee_id'
);

select * from finish();
rollback;
