begin;

select plan(23);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at)
values
  (
    'b3000000-0000-4000-8000-000000000001',
    'last-login-hr@test.local',
    '{"full_name":"Last Login HR"}',
    '2026-10-21 18:15:00+00'::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'last-login-admin@test.local',
    '{"full_name":"Last Login Admin"}',
    '2026-10-20 13:00:00+00'::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000003',
    'last-login-staff@test.local',
    '{"full_name":"Last Login Staff"}',
    '2026-10-19 12:30:00+00'::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000004',
    'never-login-staff@test.local',
    '{"full_name":"Never Login Staff"}',
    null
  ),
  (
    'b3000000-0000-4000-8000-000000000005',
    'last-login-accounts@test.local',
    '{"full_name":"Last Login Accounts"}',
    null
  );

reset role;

select private.apply_profile_role('b3000000-0000-4000-8000-000000000001', 'hr');
select private.apply_profile_role('b3000000-0000-4000-8000-000000000002', 'admin');
select private.apply_profile_role('b3000000-0000-4000-8000-000000000005', 'accounts');

select is(
  pg_get_function_result('public.list_manageable_users()'::regprocedure),
  'TABLE(id uuid, full_name text, email text, role text, last_sign_in_at timestamp with time zone, last_active_at timestamp with time zone)',
  'manageable-user directory preserves last_sign_in_at before last_active_at'
);

select is(
  pg_get_function_result(
    'public.search_staff_directory(text,text,text,integer,integer)'::regprocedure
  ),
  'TABLE(profile_id uuid, full_name text, email text, employee_id text, role text, status text, total_count bigint, last_sign_in_at timestamp with time zone, last_active_at timestamp with time zone)',
  'HR directory preserves last_sign_in_at before last_active_at'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_manageable_users'
  ),
  'manageable-user directory remains SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_staff_directory'
  ),
  'HR directory remains SECURITY DEFINER'
);

select is(
  (
    select p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_manageable_users'
  ),
  array['search_path=""']::text[],
  'manageable-user directory retains an empty search path'
);

select is(
  (
    select p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_staff_directory'
  ),
  array['search_path=""']::text[],
  'HR directory retains an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.list_manageable_users()', 'execute')
  and has_function_privilege('service_role', 'public.list_manageable_users()', 'execute')
  and not has_function_privilege('anon', 'public.list_manageable_users()', 'execute'),
  'manageable-user directory grants are preserved'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.search_staff_directory(text,text,text,integer,integer)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.search_staff_directory(text,text,text,integer,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.search_staff_directory(text,text,text,integer,integer)',
    'execute'
  ),
  'HR directory grants are preserved'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b3000000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$
    select last_sign_in_at
    from public.list_manageable_users()
    where id = 'b3000000-0000-4000-8000-000000000003'::uuid
  $$,
  $$ values ('2026-10-19 12:30:00+00'::timestamptz) $$,
  'Admin receives the authoritative successful sign-in timestamp'
);

select results_eq(
  $$
    select last_sign_in_at
    from public.list_manageable_users()
    where id = 'b3000000-0000-4000-8000-000000000004'::uuid
  $$,
  $$ values (null::timestamptz) $$,
  'Admin receives an authoritative null for a never-signed-in account'
);

select results_eq(
  $$
    select id, full_name, email, role
    from public.list_manageable_users()
    where id = 'b3000000-0000-4000-8000-000000000003'::uuid
  $$,
  $$
    values (
      'b3000000-0000-4000-8000-000000000003'::uuid,
      'Last Login Staff'::text,
      'last-login-staff@test.local'::text,
      'staff'::text
    )
  $$,
  'existing manageable-user result columns remain unchanged'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'Admin without HR Support Mode remains denied the HR directory'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b3000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$
    select last_sign_in_at
    from public.search_staff_directory('Last Login Staff', null, null, 25, 0)
  $$,
  $$ values ('2026-10-19 12:30:00+00'::timestamptz) $$,
  'permanent HR receives the authoritative successful sign-in timestamp'
);

select results_eq(
  $$
    select last_sign_in_at
    from public.search_staff_directory('Never Login Staff', null, null, 25, 0)
  $$,
  $$ values (null::timestamptz) $$,
  'permanent HR receives an authoritative null for never signed in'
);

select results_eq(
  $$
    select count(*)::bigint, min(total_count)::bigint
    from public.search_staff_directory('Login', 'active', 'staff', 1, 1)
  $$,
  $$ values (1::bigint, 2::bigint) $$,
  'HR search filters, pagination, and totals remain unchanged'
);

select results_eq(
  $$
    select full_name
    from public.search_staff_directory('Login', null, null, 25, 0)
  $$,
  $$
    values
      ('Last Login Accounts'::text),
      ('Last Login Admin'::text),
      ('Last Login HR'::text),
      ('Last Login Staff'::text),
      ('Never Login Staff'::text)
  $$,
  'adding the timestamp preserves the existing name and email sort order'
);

select throws_ok(
  $$ select 1 from public.list_manageable_users() $$,
  'P0001',
  'Role management access required',
  'permanent HR cannot use the governance directory'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b3000000-0000-4000-8000-000000000005',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'Accounts remains denied the HR directory'
);

select throws_ok(
  $$ select 1 from public.list_manageable_users() $$,
  'P0001',
  'Role management access required',
  'Accounts remains denied the governance directory'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b3000000-0000-4000-8000-000000000003',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'Staff remains denied the HR directory'
);

select throws_ok(
  $$ select 1 from public.list_manageable_users() $$,
  'P0001',
  'Role management access required',
  'Staff remains denied the governance directory'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_manageable_users'
  ),
  'postgres',
  'manageable-user directory ownership remains postgres'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_staff_directory'
  ),
  'postgres',
  'HR directory ownership remains postgres'
);

select * from finish();
rollback;
