begin;

select plan(21);

\ir support/isolate_existing_owner.inc

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d1111111-1111-4111-8111-111111111111', 'del-admin@test.local', '{"full_name":"Del Admin"}'),
  ('d2222222-2222-4222-8222-222222222222', 'del-owner@test.local', '{"full_name":"Del Owner"}'),
  ('d3333333-3333-4333-8333-333333333333', 'del-hr@test.local', '{"full_name":"Del HR"}'),
  ('d4444444-4444-4444-8444-444444444444', 'del-staff@test.local', '{"full_name":"Del Staff"}'),
  ('d5555555-5555-4555-8555-555555555555', 'del-clean@test.local', '{"full_name":"Del Clean"}'),
  ('d6666666-6666-4666-8666-666666666666', 'del-order@test.local', '{"full_name":"Del Order"}'),
  ('d7777777-7777-4777-8777-777777777777', 'reuse-ext@gmail.com', '{"full_name":"Reuse Ext"}'),
  ('d8888888-8888-4888-8888-888888888888', 'reuse-co@example.test', '{"full_name":"Reuse Co"}');

reset role;
select private.apply_profile_role('d1111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('d2222222-2222-4222-8222-222222222222', 'owner');
select private.apply_profile_role('d3333333-3333-4333-8333-333333333333', 'hr');

\ir support/submit_order_lunch_day_fixture.inc

insert into public.orders (id, profile_id, lunch_day_id, status)
values (
  'd0000000-0000-4000-8000-000000000088',
  'd6666666-6666-4666-8666-666666666666',
  '10000000-0000-0000-0000-000000000001',
  'submitted'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.get_user_deletion_eligibility('d5555555-5555-4555-8555-555555555555') ->> 'can_delete'),
  'true',
  'Admin sees clean user as deletable'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (public.get_user_deletion_eligibility('d5555555-5555-4555-8555-555555555555') ->> 'can_delete'),
  'true',
  'Owner sees clean user as deletable'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.get_user_deletion_eligibility('d1111111-1111-4111-8111-111111111111') ->> 'can_delete'),
  'false',
  'Self-delete blocked in eligibility'
);

select is(
  (public.get_user_deletion_eligibility('d2222222-2222-4222-8222-222222222222') ->> 'can_delete'),
  'false',
  'Owner target blocked in eligibility'
);

select is(
  (public.get_user_deletion_eligibility('d6666666-6666-4666-8666-666666666666') ->> 'can_delete'),
  'false',
  'User with lunch order is not deletable'
);

select ok(
  (public.get_user_deletion_eligibility('d6666666-6666-4666-8666-666666666666') ->> 'blocker_summary')
    like '%lunch history%',
  'Business history blocker summary is user-facing'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_user_deletion_eligibility('d5555555-5555-4555-8555-555555555555') $$,
  'P0001',
  'Role management access required',
  'HR cannot read deletion eligibility'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_user_deletion_eligibility('d5555555-5555-4555-8555-555555555555') $$,
  'P0001',
  'Role management access required',
  'Staff cannot read deletion eligibility'
);

reset role;

select throws_ok(
  $$ delete from public.profiles where id = 'd6666666-6666-4666-8666-666666666666' $$,
  'P0001',
  'Profile with business history cannot be deleted',
  'Direct profile delete blocked when orders exist'
);

select throws_ok(
  $$ delete from auth.users where id = 'd6666666-6666-4666-8666-666666666666' $$,
  'P0001',
  'Profile with business history cannot be deleted',
  'Auth cascade delete blocked when business history exists'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.permanently_delete_user_account(
    'd5555555-5555-4555-8555-555555555555',
    'test_account',
    null
  ) ->> 'ok'),
  'true',
  'Admin permanently deletes clean user via RPC'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where id = 'd5555555-5555-4555-8555-555555555555' $$,
  array[0::bigint],
  'Profile row removed after permanent delete'
);

reset role;

select results_eq(
  $$ select normalized_email from private.user_account_deletion_audit where deleted_profile_id = 'd5555555-5555-4555-8555-555555555555' $$,
  array['del-clean@test.local'::text],
  'Deletion audit stores normalized email snapshot'
);

insert into private.signup_requests (
  email,
  normalized_email,
  full_name,
  status,
  created_profile_id
)
values (
  'reuse-ext@gmail.com',
  'reuse-ext@gmail.com',
  'Reuse Ext',
  'approved',
  'd7777777-7777-4777-8777-777777777777'
);

select is(
  (public.permanently_delete_user_account(
    'd7777777-7777-4777-8777-777777777777',
    'duplicate_error',
    null
  ) ->> 'ok'),
  'true',
  'Approved external user can be permanently deleted when clean'
);

reset role;
delete from auth.users where id = 'd7777777-7777-4777-8777-777777777777';

set local role anon;

select is(
  (public.request_external_signup('Reuse Ext Two', 'reuse-ext@gmail.com') ->> 'code'),
  'submitted',
  'Same external email can submit a fresh pending request after deletion cleanup'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from private.signup_requests where normalized_email = 'reuse-ext@gmail.com' and status = 'pending' $$,
  array[1::bigint],
  'Fresh pending external signup request exists for reused email'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.permanently_delete_user_account(
    'd8888888-8888-4888-8888-888888888888',
    'test_account',
    null
  ) ->> 'ok'),
  'true',
  'Company-domain clean user deleted by admin'
);

reset role;
delete from auth.users where id = 'd8888888-8888-4888-8888-888888888888';

select is(
  private.signup_email_has_application_account('reuse-co@example.test'),
  false,
  'Company email has no application account after deletion'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('d9999999-9999-4999-8999-999999999999', 'queue@test.local', '{"full_name":"Queue User"}');

insert into private.signup_requests (
  id,
  email,
  normalized_email,
  full_name,
  status,
  created_profile_id
)
values (
  'e9999999-9999-4999-8999-999999999999',
  'queue@test.local',
  'queue@test.local',
  'Queue User',
  'approved',
  'd9999999-9999-4999-8999-999999999999'
);

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
  'queue@test.local',
  'Invite',
  'text',
  'html',
  'pending',
  'signup_request',
  'e9999999-9999-4999-8999-999999999999'
);

select is(
  (public.permanently_delete_user_account(
    'd9999999-9999-4999-8999-999999999999',
    'test_account',
    null
  ) ->> 'ok'),
  'true',
  'Delete cancels related signup queue entries'
);

select results_eq(
  $$ select status from private.email_delivery_queue where correlation_id = 'e9999999-9999-4999-8999-999999999999' $$,
  array['failed'::text],
  'Pending invite queue marked failed after account deletion'
);

reset role;
delete from auth.users where id = 'd9999999-9999-4999-8999-999999999999';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.permanently_delete_user_account(
    'd9999999-9999-4999-8999-999999999999',
    'test_account',
    null
  ) ->> 'ok'),
  'true',
  'Retrying permanent delete after profile removal is safe'
);

select * from finish();
rollback;
