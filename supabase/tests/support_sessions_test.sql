begin;

select plan(73);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'staff@test.local', '{"full_name":"Staff User"}'),
  ('22222222-2222-4222-8222-222222222222', 'hr@test.local', '{"full_name":"HR User"}'),
  ('33333333-3333-4333-8333-333333333333', 'accounts@test.local', '{"full_name":"Accounts User"}'),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.local', '{"full_name":"Admin User"}'),
  ('55555555-5555-4555-8555-555555555555', 'owner@test.local', '{"full_name":"Owner User"}');

\ir support/assign_test_office_defaults.inc

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'owner');

-- Non-governance roles cannot start support
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.start_support_session('hr', 'ticket 1', (select session_id from public.get_support_session_status())) $$,
  null,
  'Staff cannot start support session'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('Staff', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Staff cannot search the HR directory'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.start_support_session('hr', 'ticket 1', (select session_id from public.get_support_session_status())) $$,
  null,
  'HR cannot start support session'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.start_support_session('accounts', 'ticket 1', (select session_id from public.get_support_session_status())) $$,
  null,
  'Accounts cannot start support session'
);

-- Admin can start HR support
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select count(*) from public.get_support_session_status() $$,
  'get_support_session_status succeeds with no active session'
);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[false],
  'Admin without support cannot view all orders'
);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'ticket hr-1', (select session_id from public.get_support_session_status())) $$,
  'Admin can start HR support'
);

select results_eq(
  $$ select scope from public.get_support_session_status() $$,
  array['hr'::text],
  'Active scope is hr'
);

select ok(
  (select expires_at <= now() + interval '30 minutes' + interval '5 seconds'
     and expires_at > now() + interval '29 minutes'
   from public.get_support_session_status()),
  'Expiry limited to about 30 minutes'
);

select throws_ok(
  $$ select * from public.start_support_session('hr', '   ', (select session_id from public.get_support_session_status())) $$,
  null,
  'Blank reason denied'
);

select throws_ok(
  $$ select * from public.start_support_session('staff', 'ticket', (select session_id from public.get_support_session_status())) $$,
  null,
  'Invalid scope denied'
);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[true],
  'HR Support grants HR order read capability only'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('staff@test.local', null, null, 50, 0) $$,
  array['Staff User'::text],
  'Active Admin HR Support can search the staff directory'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('User', 'active', 'staff', 50, 0) $$,
  array['Staff User'::text],
  'Active Admin HR Support can filter the staff directory'
);

select results_eq(
  $$
    select count(*)::bigint, min(total_count)::bigint
    from public.search_staff_directory('@test.local', 'active', null, 1, 1)
  $$,
  $$ values (1::bigint, 5::bigint) $$,
  'Active Admin HR Support retains paginated directory totals'
);

select throws_ok(
  $$ select public.update_staff_name('11111111-1111-4111-8111-111111111111', 'Blocked Name') $$,
  'P0001',
  'Staff account management access required',
  'Active Admin HR Support cannot update staff names'
);

select throws_ok(
  $$ select public.set_employee_id('11111111-1111-4111-8111-111111111111', '1234') $$,
  'P0001',
  'Employee ID management access required',
  'Active Admin HR Support cannot update employee IDs'
);

select throws_ok(
  $$ select public.set_staff_active_status('11111111-1111-4111-8111-111111111111', 'inactive') $$,
  'P0001',
  'Staff account management access required',
  'Active Admin HR Support cannot change staff status'
);

select results_eq(
  $$ select private.can_manage_lunch_operations() $$,
  array[false],
  'HR Support grants no HR mutation capability'
);

-- End session
select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'Admin can end support session'
);

select is_empty(
  $$ select * from public.get_support_session_status() $$,
  'Ended session gives no active status'
);

-- Owner accounts support
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('accounts', 'owner ticket', (select session_id from public.get_support_session_status())) $$,
  'Owner can start Accounts support'
);

select results_eq(
  $$ select private.can_view_all_financial_summaries() $$,
  array[true],
  'Accounts support grants financial read capability'
);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[false],
  'Accounts support does not grant HR order read capability'
);

select results_eq(
  $$ select private.can_manage_lunch_periods() $$,
  array[false],
  'Accounts support does not grant lunch period mutations'
);

select results_eq(
  $$ select private.can_manage_lunch_operations() $$,
  array[false],
  'Support mode does not grant HR mutations'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('Staff', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Owner Accounts Support cannot search the HR directory'
);

select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'Owner can end Accounts support before changing scope'
);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'owner HR directory regression', null) $$,
  'Owner can start HR Support for directory search'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('staff@test.local', null, null, 50, 0) $$,
  array['Staff User'::text],
  'Active Owner HR Support can search the staff directory'
);

select throws_ok(
  $$ select public.update_staff_name('11111111-1111-4111-8111-111111111111', 'Blocked Owner Support Name') $$,
  'P0001',
  'Staff account management access required',
  'Active Owner HR Support cannot update staff names'
);

select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'Owner can end HR Support after directory search'
);

-- HR baseline
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[true],
  'HR retains order read access'
);

select results_eq(
  $$ select private.can_manage_lunch_operations() $$,
  array[true],
  'HR retains operational mutations'
);

select results_eq(
  $$ select full_name from public.search_staff_directory('staff@test.local', null, null, 50, 0) $$,
  array['Staff User'::text],
  'Permanent HR retains staff-directory search access'
);

select lives_ok(
  $$ select public.update_staff_name('11111111-1111-4111-8111-111111111111', 'Staff User') $$,
  'Permanent HR retains staff-management mutation access'
);

reset role;

select results_eq(
  $$ select role from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  array['owner'::text],
  'Permanent profile role never changes for support actor'
);

-- Representative RPC paths with HR support active (admin ended session; restart HR)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'rpc regression', (select session_id from public.get_support_session_status())) $$,
  'Admin can restart HR support for RPC regression'
);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[true],
  'HR Support retains order read capability for RPC path'
);

select throws_ok(
  $$ select public.fulfill_order('00000000-0000-0000-0000-000000000001') $$,
  'P0001',
  null,
  'HR Support cannot fulfill orders'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'End support before accounts RPC regression'
);

select lives_ok(
  $$ select * from public.start_support_session('accounts', 'accounts rpc regression', (select session_id from public.get_support_session_status())) $$,
  'Admin can start Accounts support for RPC regression'
);

select results_eq(
  $$ select private.can_view_lunch_periods() $$,
  array[true],
  'Accounts support can read lunch periods capability'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('Staff', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Admin Accounts Support cannot search the HR directory'
);

select throws_ok(
  $$ select public.create_first_lunch_period('Support Blocked', '2099-01-01', '2099-01-31') $$,
  'P0001',
  null,
  'Accounts support cannot create lunch periods'
);

select throws_ok(
  $$ select public.set_employee_id('11111111-1111-4111-8111-111111111111', '1234') $$,
  'P0001',
  null,
  'Accounts support cannot set employee IDs'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select * from public.get_support_session_status() $$,
  'Status RPC returns only the callers session (Accounts has none)'
);

-- Expired rows are inactive on read; status/RLS paths must not UPDATE
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.end_support_session((select session_id from public.get_support_session_status())) $$,
  'End admin session before expired-row regression'
);

reset role;

insert into private.support_sessions (
  actor_profile_id,
  actor_role,
  scope,
  reason,
  started_at,
  expires_at
)
values (
  '44444444-4444-4444-8444-444444444444',
  'admin',
  'hr',
  'expired regression',
  now() - interval '2 hours',
  now() - interval '1 hour'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select * from public.get_support_session_status() $$,
  'Expired session is not returned as active status'
);

select is(
  private.active_support_scope(),
  null,
  'Expired session yields no active support scope'
);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[false],
  'Expired session does not grant HR read capability'
);

select throws_ok(
  $$ select 1 from public.search_staff_directory('Staff', null, null, 50, 0) $$,
  'P0001',
  'Staff directory access required',
  'Expired HR Support cannot search the staff directory'
);

select lives_ok(
  $$ select count(*) from public.lunch_providers $$,
  'RLS SELECT succeeds with expired support row present'
);

reset role;

select ok(
  (
    select ended_at is null
    from private.support_sessions
    where actor_profile_id = '44444444-4444-4444-8444-444444444444'
      and reason = 'expired regression'
  ),
  'Reading expired session does not perform lazy expiration UPDATE'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select * from public.start_support_session('hr', 'replaces stale row', (select session_id from public.get_support_session_status())) $$,
  'start_support_session can clean stale sessions in write context'
);

reset role;

select results_eq(
  $$ select ended_reason from private.support_sessions where reason = 'expired regression' $$,
  array['expired'::text],
  'Write-path cleanup sets ended_reason expired on stale rows'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  $$ select p.provolatile::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'expire_stale_support_sessions' $$,
  array['v'::text],
  'expire_stale_support_sessions is VOLATILE'
);

select results_eq(
  $$ select p.provolatile::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_support_session_status' $$,
  array['s'::text],
  'get_support_session_status is STABLE and read-only'
);

select ok(
  (select session_id is not null from public.get_support_session_status()),
  'Status exposes the immutable active session UUID'
);

select ok(
  to_regprocedure('public.start_support_session(text,text)') is null,
  'Legacy identity-blind Start RPC is removed'
);

select ok(
  to_regprocedure('public.end_support_session()') is null,
  'Legacy identity-blind Exit RPC is removed'
);

select session_id as session_a_id
from public.get_support_session_status()
\gset

select is(
  (select outcome
   from public.start_support_session(
     'accounts',
     'identity-bound replacement',
     :'session_a_id'::uuid
   )),
  'started'::text,
  'Intentional replacement succeeds with the current session UUID'
);

reset role;

select results_eq(
  format(
    'select ended_reason from private.support_sessions where id = %L::uuid',
    :'session_a_id'
  ),
  array['replaced'::text],
  'Intentional replacement records the replaced audit reason'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select session_id as session_b_id
from public.get_support_session_status()
\gset

select is(
  public.end_support_session(:'session_a_id'::uuid),
  'stale'::text,
  'A stale Exit cannot terminate the replacement session'
);

select results_eq(
  format(
    'select session_id from public.get_support_session_status() where session_id = %L::uuid',
    :'session_b_id'
  ),
  array[:'session_b_id'::uuid],
  'Replacement session remains active after stale Exit'
);

select is(
  (select outcome
   from public.start_support_session(
     'hr',
     'stale replacement attempt',
     :'session_a_id'::uuid
   )),
  'stale'::text,
  'A stale Start cannot replace the current session'
);

select results_eq(
  $$ select reason from public.get_support_session_status() $$,
  array['identity-bound replacement'::text],
  'Stale Start preserves the current session details'
);

select is(
  public.end_support_session(:'session_b_id'::uuid),
  'ended'::text,
  'Normal manual Exit succeeds with the current session UUID'
);

reset role;

select results_eq(
  format(
    'select ended_reason from private.support_sessions where id = %L::uuid',
    :'session_b_id'
  ),
  array['manual'::text],
  'Normal manual Exit records the manual audit reason'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select is(
  (select outcome
   from public.start_support_session('hr', 'identity-bound no-session start', null)),
  'started'::text,
  'Start succeeds with a null expectation only when no session is active'
);

select ok(
  position(
    'for update'
    in lower(pg_get_functiondef('public.start_support_session(text,text,uuid)'::regprocedure))
  ) > 0,
  'Start holds the shared actor profile-row lock'
);

select ok(
  position(
    'for update'
    in lower(pg_get_functiondef('public.end_support_session(uuid)'::regprocedure))
  ) > 0,
  'Exit holds the shared actor profile-row lock'
);

select is(
  public.end_support_session((select session_id from public.get_support_session_status())),
  'ended'::text,
  'Identity-bound test session cleanup succeeds'
);

select * from finish();
rollback;
