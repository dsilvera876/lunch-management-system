begin;

select plan(15);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'auth-del-admin@test.local', '{"full_name":"Auth Del Admin"}'),
  ('a5555555-5555-4555-8555-555555555555', 'auth-del-clean@test.local', '{"full_name":"Auth Del Clean"}'),
  ('a7777777-7777-4777-8777-777777777777', 'auth-reuse@gmail.com', '{"full_name":"Auth Reuse"}');

reset role;
select private.apply_profile_role('a1111111-1111-4111-8111-111111111111', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.permanently_delete_user_account('a5555555-5555-4555-8555-555555555555', 'test_account', null) ->> 'auth_delete_status'),
  'pending',
  'New permanent delete records pending auth cleanup'
);

reset role;

select results_eq(
  $$ select auth_delete_status from private.user_account_deletion_audit where deleted_profile_id = 'a5555555-5555-4555-8555-555555555555' $$,
  array['pending'::text],
  'Audit row persists pending auth cleanup state'
);

select set_config(
  'test.auth_audit_a555',
  (select id::text from private.user_account_deletion_audit where deleted_profile_id = 'a5555555-5555-4555-8555-555555555555'),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  format(
    $$ select public.service_finalize_auth_user_deletion('%s'::uuid, 'retry', 'Simulated transient Auth API failure') $$,
    current_setting('test.auth_audit_a555')
  ),
  'Transient auth failure schedules retry'
);

reset role;

select results_eq(
  $$ select auth_delete_attempts >= 1 from private.user_account_deletion_audit where deleted_profile_id = 'a5555555-5555-4555-8555-555555555555' $$,
  array[true],
  'Retry increments auth delete attempts'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  format(
    $$ select public.service_finalize_auth_user_deletion('%s'::uuid, 'missing_user', null) $$,
    current_setting('test.auth_audit_a555')
  ),
  'Missing auth user is treated as successful cleanup'
);

reset role;

select results_eq(
  $$ select auth_delete_status from private.user_account_deletion_audit where deleted_profile_id = 'a5555555-5555-4555-8555-555555555555' $$,
  array['succeeded'::text],
  'Missing auth user marks cleanup succeeded'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.permanently_delete_user_account('a7777777-7777-4777-8777-777777777777', 'test_account', null) ->> 'ok'),
  'true',
  'External-style clean user profile deleted'
);

reset role;

select is(
  private.signup_email_has_application_account('auth-reuse@gmail.com'),
  true,
  'Email remains blocked while auth identity still exists'
);

select set_config(
  'test.auth_audit_a777',
  (select id::text from private.user_account_deletion_audit where deleted_profile_id = 'a7777777-7777-4777-8777-777777777777'),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  format(
    $$ select public.service_finalize_auth_user_deletion('%s'::uuid, 'succeeded', null) $$,
    current_setting('test.auth_audit_a777')
  ),
  'Auth cleanup success recorded when Admin API succeeds'
);

reset role;
delete from auth.users where id = 'a7777777-7777-4777-8777-777777777777';

select is(
  private.signup_email_has_application_account('auth-reuse@gmail.com'),
  false,
  'Email becomes reusable after auth identity is removed'
);

set local role anon;

select is(
  (public.request_external_signup('Auth Reuse Again', 'auth-reuse@gmail.com') ->> 'code'),
  'submitted',
  'External signup allowed after auth cleanup completes'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from private.user_account_deletion_audit where deleted_profile_id = 'a7777777-7777-4777-8777-777777777777' $$,
  array[1::bigint],
  'Permanent delete keeps a single audit row per profile'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.permanently_delete_user_account('a7777777-7777-4777-8777-777777777777', 'test_account', null) ->> 'already_deleted'),
  'true',
  'Second delete call is idempotent against existing audit'
);

reset role;

insert into private.user_account_deletion_audit (
  deleted_profile_id,
  normalized_email,
  previous_role,
  reason_category,
  auth_delete_status,
  auth_delete_next_attempt_at
)
values (
  'a8888888-8888-4888-8888-888888888888',
  'terminal-fail@test.local',
  'staff',
  'test_account',
  'pending',
  now() - interval '1 minute'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$ select count(*)::bigint from public.worker_claim_pending_auth_user_deletions(5) where deleted_profile_id = 'a8888888-8888-4888-8888-888888888888' $$,
  array[1::bigint],
  'Worker claims pending auth cleanup records'
);

reset role;

update private.user_account_deletion_audit
set auth_delete_attempts = 7
where deleted_profile_id = 'a8888888-8888-4888-8888-888888888888';

select set_config(
  'test.auth_audit_a888',
  (select id::text from private.user_account_deletion_audit where deleted_profile_id = 'a8888888-8888-4888-8888-888888888888'),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select public.service_finalize_auth_user_deletion(
      current_setting('test.auth_audit_a888')::uuid,
      'retry',
      'final transient failure'
    ) ->> 'auth_delete_status'
  ),
  'failed',
  'Bounded retries mark terminal failed auth cleanup'
);

select * from finish();
rollback;
