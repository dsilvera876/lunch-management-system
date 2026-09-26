begin;

select plan(45);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

-- ============================================================
-- Users and roles
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e1111111-1111-4111-8111-111111111111', 'emp-staff@test.local', '{"full_name":"Emp Staff"}'),
  ('e2222222-2222-4222-8222-222222222222', 'emp-hr@test.local', '{"full_name":"Emp HR"}'),
  ('e3333333-3333-4333-8333-333333333333', 'emp-accounts@test.local', '{"full_name":"Emp Accounts"}'),
  ('e4444444-4444-4444-8444-444444444444', 'emp-admin@test.local', '{"full_name":"Emp Admin"}'),
  ('e5555555-5555-4555-8555-555555555555', 'emp-owner@test.local', '{"full_name":"Emp Owner"}'),
  ('e6666666-6666-4666-8666-666666666666', 'emp-staff2@test.local', '{"full_name":"Emp Staff Two"}');

reset role;

select private.apply_profile_role('e2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('e3333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('e4444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('e5555555-5555-4555-8555-555555555555', 'owner');

-- ============================================================
-- Format constraints (postgres maintenance role)
-- ============================================================

reset role;

select lives_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-null@test.local', null) $$,
  'NULL employee_id is accepted'
);

select lives_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-0054@test.local', '9001') $$,
  'four-digit 9001 is accepted (0054 pattern class)'
);

select lives_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-1123@test.local', '9002') $$,
  'four-digit 9002 is accepted (1123 pattern class)'
);

select throws_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-54@test.local', '54') $$,
  '23514',
  null,
  '54 is rejected'
);

select throws_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-12345@test.local', '12345') $$,
  '23514',
  null,
  '12345 is rejected'
);

select throws_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-a054@test.local', 'A054') $$,
  '23514',
  null,
  'A054 is rejected'
);

select throws_ok(
  $$ insert into private.staff_registry (email, employee_id) values ('emp-format-space@test.local', '12 34') $$,
  '23514',
  null,
  '12 34 is rejected'
);

-- ============================================================
-- RPC format + duplicate enforcement
-- ============================================================

reset role;

delete from private.staff_registry
where profile_id is null
  and email like 'emp-format-%';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_employee_id('e1111111-1111-4111-8111-111111111111', null) $$,
  'HR can clear employee ID to NULL'
);

select lives_ok(
  $$ select public.set_employee_id('e1111111-1111-4111-8111-111111111111', '0054') $$,
  'HR can set 0054'
);

select throws_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '54') $$,
  'P0001',
  'Invalid employee ID format',
  'set_employee_id rejects 54'
);

select throws_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', ' 0054') $$,
  'P0001',
  'Invalid employee ID format',
  'set_employee_id rejects padded  0054'
);

select throws_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '0054') $$,
  '23505',
  null,
  'duplicate 0054 is rejected'
);

-- ============================================================
-- Authorization: directory + set
-- ============================================================

select lives_ok(
  $$ select 1 from public.list_employee_id_directory() limit 1 $$,
  'HR can list employee ID directory'
);

select lives_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '1123') $$,
  'HR can set employee IDs'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select 1 from public.list_employee_id_directory() limit 1 $$,
  'Accounts can list employee ID directory'
);

select lives_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '2097') $$,
  'Accounts can set employee IDs'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.list_employee_id_directory() $$,
  'P0001',
  'Employee ID management access required',
  'Staff cannot list employee IDs'
);

select throws_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '3187') $$,
  'P0001',
  'Employee ID management access required',
  'Staff cannot set employee IDs'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.list_employee_id_directory() $$,
  'P0001',
  'Employee ID management access required',
  'Admin cannot list employee IDs'
);

select throws_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '3187') $$,
  'P0001',
  'Employee ID management access required',
  'Admin cannot set employee IDs'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.list_employee_id_directory() $$,
  'P0001',
  'Employee ID management access required',
  'Owner cannot list employee IDs'
);

select throws_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '3187') $$,
  'P0001',
  'Employee ID management access required',
  'Owner cannot set employee IDs'
);

-- ============================================================
-- Direct table access denied for authenticated users
-- ============================================================

select throws_ok(
  $$ select 1 from private.staff_registry limit 1 $$,
  '42501',
  null,
  'authenticated cannot SELECT staff_registry'
);

select throws_ok(
  $$ insert into private.staff_registry (email) values ('emp-direct@test.local') $$,
  '42501',
  null,
  'authenticated cannot INSERT staff_registry'
);

select throws_ok(
  $$ update private.staff_registry set email = email where profile_id is not null $$,
  '42501',
  null,
  'authenticated cannot UPDATE staff_registry'
);

select throws_ok(
  $$ delete from private.staff_registry where profile_id is not null $$,
  '42501',
  null,
  'authenticated cannot DELETE staff_registry'
);

select throws_ok(
  $$ select 1 from private.employee_id_audit limit 1 $$,
  '42501',
  null,
  'authenticated cannot SELECT employee_id_audit'
);

-- ============================================================
-- Audit trail
-- ============================================================

reset role;

update private.staff_registry
set employee_id = null
where profile_id = 'e6666666-6666-4666-8666-666666666666';

delete from private.employee_id_audit
where staff_registry_id = (
  select id from private.staff_registry where profile_id = 'e6666666-6666-4666-8666-666666666666'
);

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '4010') $$,
  'audit setup: assign 4010'
);

select lives_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', '4011') $$,
  'audit setup: assign 4011'
);

select lives_ok(
  $$ select public.set_employee_id('e6666666-6666-4666-8666-666666666666', null) $$,
  'audit setup: clear employee ID'
);

reset role;

select results_eq(
  $$
    select old_employee_id, new_employee_id
    from private.employee_id_audit
    where staff_registry_id = (
      select id from private.staff_registry where profile_id = 'e6666666-6666-4666-8666-666666666666'
    )
    order by changed_at asc
    offset 2
    limit 1
  $$,
  $$ values ('4011'::text, null::text) $$,
  '4011 -> NULL creates an audit record'
);

select results_eq(
  $$
    select old_employee_id, new_employee_id
    from private.employee_id_audit
    where staff_registry_id = (
      select id from private.staff_registry where profile_id = 'e6666666-6666-4666-8666-666666666666'
    )
    order by changed_at asc
    offset 1
    limit 1
  $$,
  $$ values ('4010'::text, '4011'::text) $$,
  '4010 -> 4011 creates an audit record'
);

select results_eq(
  $$
    select old_employee_id, new_employee_id
    from private.employee_id_audit
    where staff_registry_id = (
      select id from private.staff_registry where profile_id = 'e6666666-6666-4666-8666-666666666666'
    )
    order by changed_at asc
    limit 1
  $$,
  $$ values (null::text, '4010'::text) $$,
  'NULL -> 4010 creates an audit record'
);

select is(
  (
    select count(*)::bigint
    from private.employee_id_audit
    where staff_registry_id = (
      select id from private.staff_registry where profile_id = 'e6666666-6666-4666-8666-666666666666'
    )
  ),
  3::bigint,
  'employee ID changes produce three audit rows before unrelated update'
);

reset role;

update private.staff_registry
set email = email
where profile_id = 'e6666666-6666-4666-8666-666666666666';

select is(
  (
    select count(*)::bigint
    from private.employee_id_audit
    where staff_registry_id = (
      select id from private.staff_registry where profile_id = 'e6666666-6666-4666-8666-666666666666'
    )
  ),
  3::bigint,
  'non-employee_id updates do not add audit rows'
);

-- ============================================================
-- Leakage regression
-- ============================================================

select throws_ok(
  $$ select employee_id from public.list_manageable_users() limit 1 $$,
  '42703',
  null,
  'list_manageable_users does not expose employee_id'
);

-- ============================================================
-- Financial export (minimal period + order fixture)
-- ============================================================

reset role;

insert into public.lunch_providers (id, name, active)
values ('f1111111-1111-4111-8111-111111111111', 'Emp ID Kitchen', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values ('f2222222-2222-4222-8222-222222222222', 'f1111111-1111-4111-8111-111111111111', 'Meal', 10.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('f2222222-2222-4222-8222-222222222222', 1);

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select public.create_first_lunch_period('Emp ID Payroll', '2099-02-01', '2099-02-11');

\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-02-02'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"f2222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
  null
);

select set_config('request.jwt.claims', json_build_object('sub', 'e6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'f1111111-1111-4111-8111-111111111111',
  '2099-02-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"f2222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
  null
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.set_employee_id('e1111111-1111-4111-8111-111111111111', '0054');

select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select ok(
  (
    select (public.get_lunch_period_export_data(
      (select id from public.lunch_periods where label = 'Emp ID Payroll')
    )->'employees'->0->>'employee_id')
  ) = 'e1111111-1111-4111-8111-111111111111',
  'legacy export still uses employee_id key for profile UUID'
);

select lives_ok(
  $$ select public.get_lunch_period_employee_id_export_data(
    (select id from public.lunch_periods where label = 'Emp ID Payroll')
  ) $$,
  'Accounts can call employee-id financial export'
);

select is(
  (
    select public.get_lunch_period_employee_id_export_data(
      (select id from public.lunch_periods where label = 'Emp ID Payroll')
    )->'employees'->0->>'employee_id'
  ),
  '0054',
  'employee-id export returns four-digit employee_id'
);

select is(
  (
    select public.get_lunch_period_employee_id_export_data(
      (select id from public.lunch_periods where label = 'Emp ID Payroll')
    )->'employees'->0->>'profile_id'
  ),
  'e1111111-1111-4111-8111-111111111111',
  'employee-id export includes profile_id separately'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.set_employee_id('e6666666-6666-4666-8666-666666666666', null);

select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select ok(
  (
    select (elem->>'employee_id') is null
    from public.get_lunch_period_employee_id_export_data(
      (select id from public.lunch_periods where label = 'Emp ID Payroll')
    ) payload,
    lateral jsonb_array_elements(payload->'employees') elem
    where elem->>'profile_id' = 'e6666666-6666-4666-8666-666666666666'
    limit 1
  ),
  'missing official employee IDs export as null'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_lunch_period_employee_id_export_data(
    (select id from public.lunch_periods where label = 'Emp ID Payroll')
  ) $$,
  'P0001',
  'Employee ID management access required',
  'Admin is denied employee-id export'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_lunch_period_employee_id_export_data(
    (select id from public.lunch_periods where label = 'Emp ID Payroll')
  ) $$,
  'P0001',
  'Employee ID management access required',
  'Owner is denied employee-id export'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_lunch_period_employee_id_export_data(
    (select id from public.lunch_periods where label = 'Emp ID Payroll')
  ) $$,
  'P0001',
  'Employee ID management access required',
  'Staff is denied employee-id export'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_lunch_period_employee_id_export_data(
    (select id from public.lunch_periods where label = 'Emp ID Payroll')
  ) $$,
  'P0001',
  'Financial export access required',
  'HR is denied employee-id export today'
);

select * from finish();
rollback;
