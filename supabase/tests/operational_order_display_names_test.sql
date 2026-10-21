begin;

select plan(28);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b9000000-0000-4000-8000-000000000001', 'display-staff@test.local', '{"full_name":"Display Staff"}'),
  ('b9000000-0000-4000-8000-000000000002', 'display-hr@test.local', '{"full_name":"Display HR"}'),
  ('b9000000-0000-4000-8000-000000000003', 'display-accounts@test.local', '{"full_name":"Display Accounts"}'),
  ('b9000000-0000-4000-8000-000000000004', 'display-admin@test.local', '{"full_name":"Display Admin"}'),
  ('b9000000-0000-4000-8000-000000000005', 'display-owner@test.local', '{"full_name":"Display Owner"}');

\ir support/assign_test_office_defaults.inc

reset role;

select private.apply_profile_role('b9000000-0000-4000-8000-000000000002', 'hr');
select private.apply_profile_role('b9000000-0000-4000-8000-000000000003', 'accounts');
select private.apply_profile_role('b9000000-0000-4000-8000-000000000004', 'admin');
select private.apply_profile_role('b9000000-0000-4000-8000-000000000005', 'owner');

\ir support/submit_order_lunch_day_fixture.inc

insert into public.orders (
  id,
  profile_id,
  lunch_day_id,
  status,
  is_late_order,
  late_order_created_by,
  late_order_approved_at,
  late_order_approved_by
)
values
  (
    'b9000000-0000-4000-8000-000000000011',
    'b9000000-0000-4000-8000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'submitted',
    true,
    'b9000000-0000-4000-8000-000000000002',
    now(),
    'b9000000-0000-4000-8000-000000000002'
  ),
  (
    'b9000000-0000-4000-8000-000000000012',
    'b9000000-0000-4000-8000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'submitted',
    false,
    null,
    null,
    null
  );

select has_function(
  'public',
  'list_operational_order_display_names',
  array['uuid[]'],
  'Operational display-name function exists'
);

select ok(
  not has_function_privilege('anon', 'public.list_operational_order_display_names(uuid[])', 'EXECUTE'),
  'Anon cannot execute the display-name function'
);

select ok(
  has_function_privilege('authenticated', 'public.list_operational_order_display_names(uuid[])', 'EXECUTE'),
  'Authenticated callers may reach the function authorization boundary'
);

select ok(
  has_function_privilege('service_role', 'public.list_operational_order_display_names(uuid[])', 'EXECUTE'),
  'Verified service workers may reach the function authorization boundary'
);

select results_eq(
  $$
    select p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_operational_order_display_names'
      and p.proargtypes = '2951'::pg_catalog.oidvector
  $$,
  array[true],
  'The display-name function is SECURITY DEFINER'
);

select ok(
  (
    select p.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_operational_order_display_names'
      and p.proargtypes = '2951'::pg_catalog.oidvector
  ),
  'The display-name function has an empty search path'
);

select ok(
  (
    select pg_catalog.pg_get_function_result(p.oid) =
      'TABLE(order_id uuid, employee_name text, late_order_created_by_name text)'
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_operational_order_display_names'
      and p.proargtypes = '2951'::pg_catalog.oidvector
  ),
  'The function exposes only the three approved display-name columns'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  '42501',
  null,
  'Staff cannot retrieve operational employee names'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  '42501',
  null,
  'Accounts cannot retrieve HR operational employee names'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  '42501',
  null,
  'Admin without HR Support Mode cannot retrieve operational employee names'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000005', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  '42501',
  null,
  'Owner without HR Support Mode cannot retrieve operational employee names'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  'Permanent HR can retrieve operational employee names'
);

select results_eq(
  $$
    select order_id, employee_name, late_order_created_by_name
    from public.list_operational_order_display_names(
      array['b9000000-0000-4000-8000-000000000011'::uuid]
    )
  $$,
  $$ values (
    'b9000000-0000-4000-8000-000000000011'::uuid,
    'Display Owner'::text,
    'Display HR'::text
  ) $$,
  'HR receives only the current employee and late-order creator names for the order'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.list_operational_order_display_names(
      array[
        'b9000000-0000-4000-8000-000000000011'::uuid,
        'b9000000-0000-4000-8000-000000000011'::uuid
      ]
    )
  $$,
  array[1::bigint],
  'Duplicate input IDs produce one result row'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where id = 'b9000000-0000-4000-8000-000000000005' $$,
  array[0::bigint],
  'The new function does not broaden direct profile RLS for HR'
);

select is_empty(
  $$ select * from public.list_operational_order_display_names(array[]::uuid[]) $$,
  'An empty input returns no names'
);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(null::uuid[]) $$,
  '22004',
  null,
  'A null input array is rejected'
);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array[null::uuid]) $$,
  '22004',
  null,
  'Null order IDs are rejected'
);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array(select gen_random_uuid() from generate_series(1, 201))) $$,
  '22023',
  null,
  'More than 200 order IDs are rejected'
);

reset role;
update public.profiles
set full_name = 'Updated Owner Name'
where id = 'b9000000-0000-4000-8000-000000000005';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select employee_name
    from public.list_operational_order_display_names(
      array['b9000000-0000-4000-8000-000000000011'::uuid]
    )
  $$,
  array['Updated Owner Name'::text],
  'Operational views receive a current profile name after an update'
);

reset role;
update public.profiles
set full_name = null
where id = 'b9000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$
    select order_id, employee_name
    from public.list_operational_order_display_names(
      array['b9000000-0000-4000-8000-000000000012'::uuid]
    )
  $$,
  $$ values ('b9000000-0000-4000-8000-000000000012'::uuid, null::text) $$,
  'A genuinely blank profile name still returns an order-scoped row'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('accounts', 'display-name accounts support', null) $$,
  'Admin can enter Accounts Support Mode for the boundary test'
);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  '42501',
  null,
  'Accounts Support Mode cannot retrieve HR operational employee names'
);

select lives_ok(
  $$
    select * from public.start_support_session(
      'hr',
      'display-name hr support',
      (select session_id from public.get_support_session_status())
    )
  $$,
  'Admin can intentionally replace Accounts support with HR Support Mode'
);

select results_eq(
  $$
    select employee_name
    from public.list_operational_order_display_names(
      array['b9000000-0000-4000-8000-000000000011'::uuid]
    )
  $$,
  array['Updated Owner Name'::text],
  'Active HR Support Mode can retrieve operational employee names'
);

select results_eq(
  $$ select private.can_manage_hr_operational_data() $$,
  array[false],
  'HR Support Mode remains read-only'
);

reset role;
update private.support_sessions
set expires_at = now() - interval '1 second'
where actor_profile_id = 'b9000000-0000-4000-8000-000000000004'
  and ended_at is null;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b9000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.list_operational_order_display_names(array['b9000000-0000-4000-8000-000000000011'::uuid]) $$,
  '42501',
  null,
  'Expired HR Support Mode cannot retrieve operational employee names'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

select results_eq(
  $$
    select employee_name
    from public.list_operational_order_display_names(
      array['b9000000-0000-4000-8000-000000000011'::uuid]
    )
  $$,
  array['Updated Owner Name'::text],
  'A verified service worker can retrieve names for provider dispatches'
);

select * from finish();
rollback;
