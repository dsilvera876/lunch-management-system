begin;

select plan(41);

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
  $$ select * from public.start_support_session('hr', 'ticket 1') $$,
  null,
  'Staff cannot start support session'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.start_support_session('hr', 'ticket 1') $$,
  null,
  'HR cannot start support session'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.start_support_session('accounts', 'ticket 1') $$,
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
  $$ select * from public.start_support_session('hr', 'ticket hr-1') $$,
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
  $$ select * from public.start_support_session('hr', '   ') $$,
  null,
  'Blank reason denied'
);

select throws_ok(
  $$ select * from public.start_support_session('staff', 'ticket') $$,
  null,
  'Invalid scope denied'
);

select results_eq(
  $$ select private.can_view_all_orders() $$,
  array[true],
  'HR Support grants HR order read capability only'
);

select results_eq(
  $$ select private.can_manage_lunch_operations() $$,
  array[false],
  'HR Support grants no HR mutation capability'
);

-- End session
select lives_ok(
  $$ select public.end_support_session() $$,
  'Admin can end support session'
);

select is_empty(
  $$ select * from public.get_support_session_status() $$,
  'Ended session gives no active status'
);

-- Owner accounts support
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('accounts', 'owner ticket') $$,
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

reset role;

select results_eq(
  $$ select role from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  array['owner'::text],
  'Permanent profile role never changes for support actor'
);

-- Representative RPC paths with HR support active (admin ended session; restart HR)
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'rpc regression') $$,
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
  $$ select public.end_support_session() $$,
  'End support before accounts RPC regression'
);

select lives_ok(
  $$ select * from public.start_support_session('accounts', 'accounts rpc regression') $$,
  'Admin can start Accounts support for RPC regression'
);

select results_eq(
  $$ select private.can_view_lunch_periods() $$,
  array[true],
  'Accounts support can read lunch periods capability'
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
  $$ select public.end_support_session() $$,
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
  $$ select * from public.start_support_session('hr', 'replaces stale row') $$,
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

select * from finish();
rollback;
