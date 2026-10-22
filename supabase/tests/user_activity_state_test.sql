begin;

select plan(34);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at)
values
  (
    'b4000000-0000-4000-8000-000000000001',
    'activity-staff@test.local',
    '{"full_name":"José Activity Staff"}',
    '2026-10-21 18:15:00+00'::timestamptz
  ),
  (
    'b4000000-0000-4000-8000-000000000002',
    'activity-inactive@test.local',
    '{"full_name":"Inactive Activity Staff"}',
    null
  ),
  (
    'b4000000-0000-4000-8000-000000000003',
    'activity-hr@test.local',
    '{"full_name":"Activity HR"}',
    null
  ),
  (
    'b4000000-0000-4000-8000-000000000004',
    'activity-admin@test.local',
    '{"full_name":"Activity Admin"}',
    null
  ),
  (
    'b4000000-0000-4000-8000-000000000005',
    'activity-accounts@test.local',
    '{"full_name":"Activity Accounts"}',
    null
  );

reset role;

select private.apply_profile_role('b4000000-0000-4000-8000-000000000003', 'hr');
select private.apply_profile_role('b4000000-0000-4000-8000-000000000004', 'admin');
select private.apply_profile_role('b4000000-0000-4000-8000-000000000005', 'accounts');
select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'b4000000-0000-4000-8000-000000000002';
select private.deactivate_trusted_account_status_change();

select has_table('private', 'user_activity_state', 'private activity state exists');

select columns_are(
  'private',
  'user_activity_state',
  array['profile_id', 'last_active_at'],
  'activity state stores only profile identity and the latest timestamp'
);

select col_is_pk(
  'private',
  'user_activity_state',
  'profile_id',
  'one activity state row exists per profile'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.user_activity_state'::regclass),
  'private activity state has row-level security enabled'
);

select ok(
  not has_table_privilege('authenticated', 'private.user_activity_state', 'select')
  and not has_table_privilege('authenticated', 'private.user_activity_state', 'insert')
  and not has_table_privilege('authenticated', 'private.user_activity_state', 'update'),
  'authenticated callers have no direct activity-state access'
);

select ok(
  not has_table_privilege('service_role', 'private.user_activity_state', 'select')
  and not has_table_privilege('service_role', 'private.user_activity_state', 'insert')
  and not has_table_privilege('service_role', 'private.user_activity_state', 'update'),
  'service callers have no direct activity-state access'
);

select is(
  pg_get_function_result('public.record_current_user_activity()'::regprocedure),
  'TABLE(recorded boolean, last_active_at timestamp with time zone)',
  'activity RPC returns only throttle outcome and authoritative timestamp'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.record_current_user_activity()'::regprocedure),
  'activity RPC is SECURITY DEFINER'
);

select is(
  (
    select pg_get_userbyid(proowner)
    from pg_proc
    where oid = 'public.record_current_user_activity()'::regprocedure
  ),
  'postgres',
  'activity RPC is owned by postgres'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.record_current_user_activity()'::regprocedure
  ),
  array['search_path=""']::text[],
  'activity RPC uses an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.record_current_user_activity()', 'execute')
  and not has_function_privilege('anon', 'public.record_current_user_activity()', 'execute')
  and not has_function_privilege('service_role', 'public.record_current_user_activity()', 'execute'),
  'only authenticated browser users receive activity RPC execution'
);

select is(
  pg_get_function_result('public.list_manageable_users()'::regprocedure),
  'TABLE(id uuid, full_name text, email text, role text, last_sign_in_at timestamp with time zone, last_active_at timestamp with time zone)',
  'governance directory appends only last_active_at'
);

select is(
  pg_get_function_result(
    'public.search_staff_directory(text,text,text,integer,integer)'::regprocedure
  ),
  'TABLE(profile_id uuid, full_name text, email text, employee_id text, role text, status text, total_count bigint, last_sign_in_at timestamp with time zone, last_active_at timestamp with time zone)',
  'HR directory appends only last_active_at'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select recorded from public.record_current_user_activity() $$,
  array[true],
  'active authenticated user records its own initial activity'
);

reset role;

select is(
  (
    select count(*)::bigint
    from private.user_activity_state
    where profile_id = 'b4000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'initial activity creates exactly one state row'
);

select is(
  (
    select count(*)::bigint
    from private.user_activity_state
    where profile_id <> 'b4000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'self-only activity call does not create another profile state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select recorded from public.record_current_user_activity() $$,
  array[false],
  'activity inside five minutes is throttled by PostgreSQL'
);

reset role;

select is(
  (
    select count(*)::bigint
    from private.user_activity_state
    where profile_id = 'b4000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'throttled activity does not add history rows'
);

update private.user_activity_state
set last_active_at = '2026-01-01 00:00:00+00'::timestamptz
where profile_id = 'b4000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select recorded from public.record_current_user_activity() $$,
  array[true],
  'activity is recorded after the authoritative throttle window'
);

reset role;

select ok(
  (
    select last_active_at > '2026-01-01 00:00:00+00'::timestamptz
    from private.user_activity_state
    where profile_id = 'b4000000-0000-4000-8000-000000000001'
  ),
  'eligible activity advances the timestamp using database time'
);

select results_eq(
  $$
    select last_sign_in_at
    from auth.users
    where id = 'b4000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('2026-10-21 18:15:00+00'::timestamptz) $$,
  'activity reporting leaves Last Logged In unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select * from public.record_current_user_activity() $$,
  'P0001',
  'Active authenticated profile required',
  'inactive profile cannot record activity'
);

reset role;

select is(
  (
    select count(*)::bigint
    from private.user_activity_state
    where profile_id = 'b4000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'inactive activity denial creates no state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000004',
    'role', 'authenticated'
  )::text,
  true
);

select ok(
  (
    select last_active_at is not null
    from public.list_manageable_users()
    where id = 'b4000000-0000-4000-8000-000000000001'
  ),
  'authorized governance directory receives Last Active'
);

select results_eq(
  $$
    select last_active_at
    from public.list_manageable_users()
    where id = 'b4000000-0000-4000-8000-000000000003'
  $$,
  $$ values (null::timestamptz) $$,
  'missing activity remains an authoritative null'
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
    'sub', 'b4000000-0000-4000-8000-000000000003',
    'role', 'authenticated'
  )::text,
  true
);

select ok(
  (
    select last_active_at is not null
    from public.search_staff_directory('José', null, null, 25, 0)
  ),
  'permanent HR receives Last Active through Unicode search'
);

select throws_ok(
  $$ select 1 from public.list_manageable_users() $$,
  'P0001',
  'Role management access required',
  'permanent HR remains denied the governance directory'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000004',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select *
    from public.start_support_session(
      'hr',
      'Last Active read-only regression',
      (select session_id from public.get_support_session_status())
    )
  $$,
  'Admin can enter HR Support Mode for Last Active read access'
);

select ok(
  (
    select last_active_at is not null
    from public.search_staff_directory('activity-staff@test.local', null, null, 25, 0)
  ),
  'active HR Support Mode can read Last Active'
);

reset role;
update private.support_sessions
set expires_at = statement_timestamp() - interval '1 second'
where actor_profile_id = 'b4000000-0000-4000-8000-000000000004'
  and ended_at is null;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000004',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'expired HR Support Mode loses Last Active directory access'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000005',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select 1 from public.search_staff_directory() $$,
  'P0001',
  'Staff directory access required',
  'Accounts remains denied Last Active directory data'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b4000000-0000-4000-8000-000000000003',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$
    select full_name
    from public.search_staff_directory('José', null, null, 25, 0)
  $$,
  $$ values ('José Activity Staff'::text) $$,
  'existing Unicode search behavior is preserved'
);

select results_eq(
  $$
    select count(*)::bigint, min(total_count)::bigint
    from public.search_staff_directory('Activity', 'active', null, 1, 1)
  $$,
  $$ values (1::bigint, 4::bigint) $$,
  'existing filtering, limits, offsets, and totals are preserved'
);

select * from finish();
rollback;
