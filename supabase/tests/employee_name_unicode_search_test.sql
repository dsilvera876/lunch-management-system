begin;

select plan(42);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b6100000-0000-4000-8000-000000000001', 'unicode-hr@test.local', '{"full_name":"Unicode HR"}'),
  ('b6100000-0000-4000-8000-000000000002', 'unicode-accounts@test.local', '{"full_name":"Unicode Accounts"}'),
  ('b6100000-0000-4000-8000-000000000003', 'unicode-admin@test.local', '{"full_name":"Unicode Admin"}'),
  ('b6100000-0000-4000-8000-000000000004', 'unicode-staff@test.local', '{"full_name":"Unicode Staff"}'),
  ('b6100000-0000-4000-8000-000000000010', 'unicode-person-10@test.local', '{"full_name":"José Álvarez"}'),
  ('b6100000-0000-4000-8000-000000000011', 'unicode-person-11@test.local', '{"full_name":"Renée O''Connor"}'),
  ('b6100000-0000-4000-8000-000000000012', 'unicode-person-12@test.local', '{"full_name":"Anne-Marie François"}'),
  ('b6100000-0000-4000-8000-000000000013', 'unicode-person-13@test.local', '{"full_name":"Zoë Smith"}'),
  ('b6100000-0000-4000-8000-000000000014', 'unicode-person-14@test.local', '{"full_name":"D’Angelo Brown"}');

insert into auth.users (id, email, raw_user_meta_data)
values (
  'b6100000-0000-4000-8000-000000000015',
  'unicode-person-15@test.local',
  jsonb_build_object('full_name', 'Jose' || chr(769) || ' NFD')
);

reset role;

select private.apply_profile_role('b6100000-0000-4000-8000-000000000001', 'hr');
select private.apply_profile_role('b6100000-0000-4000-8000-000000000002', 'accounts');
select private.apply_profile_role('b6100000-0000-4000-8000-000000000003', 'admin');

select ok(
  not has_function_privilege(
    'authenticated',
    'private.normalize_employee_name_search(text)',
    'execute'
  ),
  'authenticated callers cannot execute the private normalization helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.search_staff_directory(text,text,text,integer,integer)',
    'execute'
  ),
  'anonymous callers cannot execute staff-directory search'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.search_staff_directory(text,text,text,integer,integer)',
    'execute'
  ),
  'authenticated callers retain staff-directory RPC execution privilege'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.search_employee_id_directory(text,integer,integer)',
    'execute'
  ),
  'authenticated callers retain Employee-ID RPC execution privilege'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    inner join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_staff_directory'
  ),
  'staff-directory search remains SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    inner join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_employee_id_directory'
  ),
  'Employee-ID search remains SECURITY DEFINER'
);

select is(
  (
    select p.proconfig
    from pg_proc p
    inner join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_staff_directory'
  ),
  array['search_path=""']::text[],
  'staff-directory search retains an empty search path'
);

select is(
  (
    select p.proconfig
    from pg_proc p
    inner join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_employee_id_directory'
  ),
  array['search_path=""']::text[],
  'Employee-ID search retains an empty search path'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b6100000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select public.set_employee_id('b6100000-0000-4000-8000-000000000010', '6100');
select public.set_employee_id('b6100000-0000-4000-8000-000000000011', '6101');
select public.set_employee_id('b6100000-0000-4000-8000-000000000012', '6102');
select public.set_employee_id('b6100000-0000-4000-8000-000000000013', '6103');
select public.set_employee_id('b6100000-0000-4000-8000-000000000014', '6104');
select public.set_employee_id('b6100000-0000-4000-8000-000000000015', '6105');

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('jose', null, null, 50, 0) $$,
  array[2::bigint],
  'unaccented lowercase search finds composed and decomposed José names'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('jose alvarez', null, null, 50, 0) $$,
  array['José Álvarez'::text],
  'staff-directory search returns the original composed display name'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('francois', null, null, 50, 0) $$,
  array['Anne-Marie François'::text],
  'staff-directory search folds cedilla accents'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('RENÉE', null, null, 50, 0) $$,
  array['Renée O''Connor'::text],
  'staff-directory search remains case-insensitive with accented query text'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('José', null, null, 50, 0) $$,
  array[2::bigint],
  'composed query text finds both canonical name representations'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('Jose' || chr(769), null, null, 50, 0) $$,
  array[2::bigint],
  'decomposed query text finds both canonical name representations'
);

select results_eq(
  $$
    select encode(convert_to(full_name, 'UTF8'), 'hex')
    from public.search_staff_directory('jose nfd', null, null, 50, 0)
  $$,
  array[encode(convert_to('Jose' || chr(769) || ' NFD', 'UTF8'), 'hex')],
  'search does not normalize or modify the stored decomposed display name'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('Anne-Marie', null, null, 50, 0) $$,
  array[1::bigint],
  'hyphenated exact-name search still works'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('Anne Marie', null, null, 50, 0) $$,
  array[0::bigint],
  'search does not make hyphens optional'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('O''Connor', null, null, 50, 0) $$,
  array[1::bigint],
  'straight-apostrophe name search works'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('O’Connor', null, null, 50, 0) $$,
  array[0::bigint],
  'search does not equate straight and curly apostrophes'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('D’Angelo', null, null, 50, 0) $$,
  array[1::bigint],
  'curly-apostrophe name search works'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('D''Angelo', null, null, 50, 0) $$,
  array[0::bigint],
  'search does not replace curly apostrophes with straight apostrophes'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory('jose', null, null, 1, 0) $$,
  array[1::bigint],
  'staff-directory search retains its requested page limit'
);

select results_eq(
  $$ select total_count from public.search_staff_directory('jose', null, null, 1, 1) $$,
  array[2::bigint],
  'staff-directory pagination retains the complete result count'
);

select results_eq(
  $$ select count(*)::bigint from public.search_staff_directory(chr(769), null, null, 50, 0) $$,
  array[0::bigint],
  'a combining-mark-only query does not match every staff-directory name'
);

select results_eq(
  $$ select count(*)::bigint from public.search_employee_id_directory('jose', 50, 0) $$,
  array[2::bigint],
  'HR Employee-ID search finds composed and decomposed José names'
);

select results_eq(
  $$ select full_name from public.search_employee_id_directory('francois', 50, 0) $$,
  array['Anne-Marie François'::text],
  'Employee-ID search returns the original accented display name'
);

select results_eq(
  $$ select count(*)::bigint from public.search_employee_id_directory('jose', 1, 0) $$,
  array[1::bigint],
  'Employee-ID search retains its requested page limit'
);

select results_eq(
  $$ select total_count from public.search_employee_id_directory('jose', 1, 1) $$,
  array[2::bigint],
  'Employee-ID pagination retains the complete result count'
);

select results_eq(
  $$ select count(*)::bigint from public.search_employee_id_directory(chr(769), 50, 0) $$,
  array[0::bigint],
  'a combining-mark-only query does not match every Employee-ID name'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b6100000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select full_name from public.search_employee_id_directory('zoe', 50, 0) $$,
  array['Zoë Smith'::text],
  'Accounts retains authorized accent-insensitive Employee-ID search'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('zoe', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Accounts does not gain HR staff-directory access'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b6100000-0000-4000-8000-000000000004',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('zoe', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Staff cannot search the HR directory'
);

select throws_ok(
  $$ select 1 from public.search_employee_id_directory('zoe', 50, 0) $$,
  'P0001',
  'Employee ID directory access required',
  'Staff cannot search the Employee-ID directory'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b6100000-0000-4000-8000-000000000003',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('zoe', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Admin without Support Mode cannot search the HR directory'
);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'unicode search test', null) $$,
  'Admin can start HR Support Mode'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('zoe', null, null, 50, 0) $$,
  array['Zoë Smith'::text],
  'active HR Support Mode retains staff-directory search access'
);

select results_eq(
  $$ select full_name from public.search_employee_id_directory('zoe', 50, 0) $$,
  array['Zoë Smith'::text],
  'active HR Support Mode retains Employee-ID search access'
);

select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'Admin can end HR Support Mode'
);

select lives_ok(
  $$ select * from public.start_support_session('accounts', 'unicode search test', null) $$,
  'Admin can start Accounts Support Mode'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('zoe', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Accounts Support Mode does not grant HR staff-directory access'
);

select results_eq(
  $$ select full_name from public.search_employee_id_directory('zoe', 50, 0) $$,
  array['Zoë Smith'::text],
  'active Accounts Support Mode retains Employee-ID search access'
);

select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'Admin can end Accounts Support Mode'
);

select * from finish();
rollback;
