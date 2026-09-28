begin;

select plan(15);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c8111111-1111-4111-8111-111111111111', 'queue-hr@test.local', '{"full_name":"Queue HR"}');

reset role;
select private.apply_profile_role('c8111111-1111-4111-8111-111111111111', 'hr');

insert into private.signup_requests (
  id,
  full_name,
  email,
  normalized_email,
  status,
  requested_at
)
values (
  'c8222222-2222-4222-8222-222222222222',
  'External Queue User',
  'external-queue@example.test',
  'external-queue@example.test',
  'approved',
  now()
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_like(
  $$ select public.service_enqueue_email_delivery(
    'auth_hook',
    'external-queue@example.test',
    'Subject',
    'text body',
    '<p>html</p>'
  ) $$,
  '%permission denied%',
  'authenticated users cannot enqueue email delivery'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (select public.service_enqueue_email_delivery(
    'auth_hook',
    'external-queue@example.test',
    'Invite subject',
    'text with token_hash=secret-value',
    '<p>html with token_hash=secret-value</p>'
  )) is not null,
  'service role can enqueue auth hook email'
);

reset role;

select is(
  (select invite_queued_at is not null from private.signup_requests where id = 'c8222222-2222-4222-8222-222222222222'),
  true,
  'signup request invite_queued_at set on enqueue'
);

select is(
  (select invite_sent_at is null from private.signup_requests where id = 'c8222222-2222-4222-8222-222222222222'),
  true,
  'invite_sent_at remains null until worker sends'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select count(*)::int from public.worker_claim_email_delivery_queue(5)),
  1,
  'worker claims pending queue row'
);

reset role;

select is(
  (select status from private.email_delivery_queue limit 1),
  'processing',
  'claimed row moves to processing'
);

select set_config(
  'test.queue_id',
  (select id::text from private.email_delivery_queue limit 1),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  format(
    $$ select public.worker_complete_email_delivery('%s'::uuid, 'sent', null) $$,
    current_setting('test.queue_id')
  ),
  'worker can mark queue row sent'
);

reset role;

select is(
  (select invite_sent_at is not null from private.signup_requests where id = 'c8222222-2222-4222-8222-222222222222'),
  true,
  'worker sent marks invite_sent_at on correlated signup request'
);

select is(
  (select text_body from private.email_delivery_queue limit 1),
  '[redacted after send]',
  'successful send redacts sensitive queue body'
);

reset role;

insert into private.email_delivery_queue (
  message_type,
  recipient_email,
  subject,
  text_body,
  html_body,
  status,
  correlation_type,
  correlation_id
)
values (
  'account_setup_invite',
  'external-queue@example.test',
  'Stale pending invite',
  'stale text',
  '<p>stale</p>',
  'pending',
  'signup_request',
  'c8222222-2222-4222-8222-222222222222'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (select public.service_enqueue_email_delivery(
    'account_setup_invite',
    'external-queue@example.test',
    'Retry subject',
    'retry text',
    '<p>retry</p>',
    'signup_request',
    'c8222222-2222-4222-8222-222222222222',
    true
  )) is not null,
  'retry enqueue supersedes with explicit correlation'
);

reset role;

select is(
  (select count(*)::int
   from private.email_delivery_queue
   where status = 'failed'
     and last_error = 'Superseded by a newer delivery attempt.'),
  1,
  'superseded pending row marked failed'
);

select is(
  (select count(*)::int
   from private.email_delivery_queue
   where status = 'pending'),
  1,
  'one active pending row remains after supersede'
);

reset role;

delete from private.email_delivery_queue where status = 'pending';

insert into private.email_delivery_queue (
  message_type,
  recipient_email,
  subject,
  text_body,
  html_body,
  status,
  attempts,
  available_at
)
values (
  'auth_hook',
  'fail@example.test',
  'Fail subject',
  'fail text',
  '<p>fail</p>',
  'pending',
  4,
  now()
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select set_config(
  'test.fail_queue_id',
  coalesce((select id::text from public.worker_claim_email_delivery_queue(1) limit 1), ''),
  false
);

select ok(current_setting('test.fail_queue_id') <> '', 'worker claims retry candidate');

select lives_ok(
  format(
    $$ select public.worker_complete_email_delivery('%s'::uuid, 'failed', 'SMTP timeout token_hash=abc') $$,
    current_setting('test.fail_queue_id')
  ),
  'worker records terminal failure at max attempts'
);

reset role;

select is(
  (select status from private.email_delivery_queue where recipient_email = 'fail@example.test'),
  'failed',
  'failure at max attempts marks queue row failed'
);

select * from finish();
rollback;
