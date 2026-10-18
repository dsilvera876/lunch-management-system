begin;

select plan(26);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b8111111-1111-4111-8111-111111111111', 'recovery-hr@test.local', '{"full_name":"Recovery HR"}'),
  ('b8222222-2222-4222-8222-222222222222', 'recovery-admin@test.local', '{"full_name":"Recovery Admin"}'),
  ('b8999999-9999-4999-8999-999999999999', 'recovery-owner@test.local', '{"full_name":"Recovery Owner"}');

reset role;
select private.apply_profile_role('b8111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('b8222222-2222-4222-8222-222222222222', 'admin');
select private.apply_profile_role('b8999999-9999-4999-8999-999999999999', 'owner');

set local role anon;
select public.request_external_signup('Recovery External', 'recovery.external@gmail.com');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated'
)::text, true);
select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests('recovery.external@gmail.com', 'pending', 1, 0)),
  null
);

reset role;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  'b8333333-3333-4333-8333-333333333333',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'recovery.external@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Recovery External"}'::jsonb,
  now(), now(), false, false
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated'
)::text, true);
select public.link_signup_request_profile(
  (select request_id from public.search_signup_requests('recovery.external@gmail.com', 'approved', 1, 0)),
  'b8333333-3333-4333-8333-333333333333', null
);

select set_config(
  'test.recovery_request_id',
  (select request_id::text from public.search_signup_requests('recovery.external@gmail.com', 'approved', 1, 0)),
  false
);

select is(
  public.prepare_signup_account_setup_recovery(
    current_setting('test.recovery_request_id')::uuid,
    'b8333333-3333-4333-8333-333333333333',
    'b8444444-4444-4444-8444-444444444444'
  ),
  'prepared',
  'permanent HR can prepare recovery for the linked incomplete account'
);

reset role;
select isnt(
  (select account_setup_recovery_nonce_hash from private.signup_requests
   where id = current_setting('test.recovery_request_id')::uuid),
  'b8444444-4444-4444-8444-444444444444',
  'only the recovery-purpose nonce hash is stored'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b8222222-2222-4222-8222-222222222222', 'role', 'authenticated'
)::text, true);
select throws_ok(
  format(
    $$ select public.prepare_signup_account_setup_recovery('%s'::uuid, 'b8333333-3333-4333-8333-333333333333', 'b8555555-5555-4555-8555-555555555555') $$,
    current_setting('test.recovery_request_id')
  ),
  'Signup request management access required',
  'Admin cannot mutate account setup recovery state'
);

select set_config('request.jwt.claims', json_build_object(
  'sub', 'b8999999-9999-4999-8999-999999999999', 'role', 'authenticated'
)::text, true);
select throws_ok(
  format(
    $$ select public.prepare_signup_account_setup_recovery('%s'::uuid, 'b8333333-3333-4333-8333-333333333333', 'b8555555-5555-4555-8555-555555555555') $$,
    current_setting('test.recovery_request_id')
  ),
  'Signup request management access required',
  'Owner Support Mode cannot mutate account setup recovery state'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (public.service_enqueue_signup_recovery_email(
    'b8555555-5555-4555-8555-555555555555',
    'b8333333-3333-4333-8333-333333333333',
    'recovery.external@gmail.com', 'old-token', 'Setup', 'body', '<p>body</p>'
  ) ->> 'outcome'),
  'ordinary',
  'a stale or unprepared signed purpose downgrades to ordinary recovery'
);

reset role;
update private.signup_requests
set account_setup_recovery_requested_at = now() - interval '30 minutes'
where id = current_setting('test.recovery_request_id')::uuid;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (public.service_enqueue_signup_recovery_email(
    'b8444444-4444-4444-8444-444444444444',
    'b8333333-3333-4333-8333-333333333333',
    'RECOVERY.EXTERNAL@gmail.com', 'old-token', 'Setup', 'body', '<p>body</p>'
  ) ->> 'outcome') = 'queued',
  'signed hook queueing accepts normalized matching identity and nonce within the Auth lifetime'
);

reset role;
select is(
  has_table_privilege('authenticated', 'private.email_delivery_queue', 'select'),
  false,
  'authenticated users cannot inspect queued recovery links or token hashes'
);

update auth.users
set recovery_token = 'old-token', recovery_sent_at = now()
where id = 'b8333333-3333-4333-8333-333333333333';
update private.email_delivery_queue
set status = 'processing'
where auth_token_hash = 'old-token';
select set_config(
  'test.old_recovery_queue_id',
  (select id::text from private.email_delivery_queue where auth_token_hash = 'old-token'),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.worker_should_deliver_email_queue_message(
    current_setting('test.old_recovery_queue_id')::uuid
  ),
  true,
  'worker accepts only the current non-expired Auth recovery token'
);

reset role;
update auth.users set recovery_sent_at = now() - interval '2 hours'
where id = 'b8333333-3333-4333-8333-333333333333';

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.worker_should_deliver_email_queue_message(
    current_setting('test.old_recovery_queue_id')::uuid
  ),
  false,
  'worker refuses an expired recovery link'
);

reset role;
update private.email_delivery_queue set status = 'pending', claimed_at = null
where auth_token_hash = 'old-token';
update auth.users set recovery_token = 'new-token', recovery_sent_at = now()
where id = 'b8333333-3333-4333-8333-333333333333';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated'
)::text, true);
select is(
  public.prepare_signup_account_setup_recovery(
    current_setting('test.recovery_request_id')::uuid,
    'b8333333-3333-4333-8333-333333333333',
    'b8666666-6666-4666-8666-666666666666'
  ),
  'prepared',
  'a later HR recovery safely replaces the purpose nonce without a blocking state'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  (public.service_enqueue_signup_recovery_email(
    'b8666666-6666-4666-8666-666666666666',
    'b8333333-3333-4333-8333-333333333333',
    'recovery.external@gmail.com', 'new-token', 'Setup 2', 'body 2', '<p>body 2</p>'
  ) ->> 'outcome') = 'queued',
  'a later valid recovery email can be queued'
);

reset role;
update private.email_delivery_queue set status = 'processing'
where auth_token_hash in ('old-token', 'new-token');
select set_config(
  'test.new_recovery_queue_id',
  (select id::text from private.email_delivery_queue where auth_token_hash = 'new-token'),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.worker_should_deliver_email_queue_message(
    current_setting('test.old_recovery_queue_id')::uuid
  ), false, 'superseded recovery link is not delivered'
);
select is(
  public.worker_should_deliver_email_queue_message(
    current_setting('test.new_recovery_queue_id')::uuid
  ), true, 'newest current recovery link remains deliverable'
);

reset role;
insert into private.email_delivery_queue (
  id, message_type, recipient_email, subject, text_body, html_body, status,
  correlation_type, correlation_id
) values
  ('b8888888-8888-4888-8888-888888888881', 'auth_hook', 'recovery.external@gmail.com',
   'Legacy Auth', 'sensitive legacy link', '<p>sensitive legacy link</p>', 'processing', null, null),
  ('b8888888-8888-4888-8888-888888888882', 'account_setup_invite', 'recovery.external@gmail.com',
   'Legacy Setup', 'sensitive legacy link', '<p>sensitive legacy link</p>', 'processing', 'signup_request',
   current_setting('test.recovery_request_id')::uuid),
  ('b8888888-8888-4888-8888-888888888883', 'auth_hook', 'recovery.external@gmail.com',
   'Verified Auth', 'verified body', '<p>verified body</p>', 'processing', 'verified_auth_hook',
   'b8333333-3333-4333-8333-333333333333'),
  ('b8888888-8888-4888-8888-888888888884', 'test', 'recovery.external@gmail.com',
   'Non-auth', 'ordinary body', '<p>ordinary body</p>', 'processing', null, null);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.worker_should_deliver_email_queue_message('b8888888-8888-4888-8888-888888888881'), false,
  'worker refuses legacy Auth hook mail without validation metadata');
select is(public.worker_should_deliver_email_queue_message('b8888888-8888-4888-8888-888888888882'), false,
  'worker refuses legacy account setup mail without token metadata');
select is(public.worker_should_deliver_email_queue_message('b8888888-8888-4888-8888-888888888883'), true,
  'worker accepts a non-recovery message from the verified signed Auth hook');
select is(public.worker_should_deliver_email_queue_message('b8888888-8888-4888-8888-888888888884'), true,
  'worker preserves unrelated mail processing');

reset role;
update private.email_delivery_queue
set status = 'failed', last_error = 'Quarantined during authentication queue security upgrade.'
where id in ('b8888888-8888-4888-8888-888888888881', 'b8888888-8888-4888-8888-888888888882');
select ok(
  not exists (
    select 1 from private.email_delivery_queue
    where id in ('b8888888-8888-4888-8888-888888888881', 'b8888888-8888-4888-8888-888888888882')
      and (text_body not like '[redacted%' or html_body not like '[redacted%')
  ),
  'quarantined legacy authentication rows retain sanitized terminal audit history'
);

select is(
  public.service_authorize_signup_onboarding(
    'b8333333-3333-4333-8333-333333333333',
    'recovery',
    'b8666666-6666-4666-8666-666666666666'
  ), true, 'trusted route can authorize onboarding after token verification'
);

select is(
  public.service_authorize_signup_onboarding(
    'b8333333-3333-4333-8333-333333333333',
    'recovery',
    'b8666666-6666-4666-8666-666666666666'
  ), false, 'consumed purpose nonce cannot authorize onboarding twice'
);

select is(
  (public.service_complete_signup_onboarding(
    'b8333333-3333-4333-8333-333333333333'
  ) ->> 'code'), 'completed',
  'trusted post-password-update step completes onboarding'
);

select is(
  (public.service_complete_signup_onboarding(
    'b8333333-3333-4333-8333-333333333333'
  ) ->> 'code'), 'already_completed',
  'onboarding completion is idempotent'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated'
)::text, true);
select is(
  public.prepare_signup_account_setup_recovery(
    current_setting('test.recovery_request_id')::uuid,
    'b8333333-3333-4333-8333-333333333333',
    'b8777777-7777-4777-8777-777777777777'
  ), 'completed',
  'completed account recovery is a no-op'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.service_complete_signup_onboarding(uuid)',
    'execute'
  ), false, 'authenticated users cannot invoke trusted onboarding completion'
);

select throws_like(
  $$ select public.service_enqueue_ordinary_recovery_email(
    'b8333333-3333-4333-8333-333333333333',
    'different@example.test', 'ordinary-token', 'Reset', 'body', '<p>body</p>'
  ) $$,
  '%permission denied%',
  'authenticated callers cannot invoke service recovery queue RPCs'
);

reset role;
select ok(
  to_regclass('private.signup_recovery_attempts') is null,
  'rejected durable recovery-attempt state is not installed'
);

select * from finish();
rollback;
