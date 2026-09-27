begin;

select plan(36);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b8111111-1111-4111-8111-111111111111', 'auth-admin@test.local', '{"full_name":"Auth Admin"}'),
  ('b8222222-2222-4222-8222-222222222222', 'auth-owner@test.local', '{"full_name":"Auth Owner"}'),
  ('b8333333-3333-4333-8333-333333333333', 'auth-hr@test.local', '{"full_name":"Auth HR"}'),
  ('b8444444-4444-4444-8444-444444444444', 'auth-accounts@test.local', '{"full_name":"Auth Accounts"}'),
  ('b8555555-5555-4555-8555-555555555555', 'auth-staff@test.local', '{"full_name":"Auth Staff"}');

reset role;
select private.apply_profile_role('b8111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('b8222222-2222-4222-8222-222222222222', 'owner');
select private.apply_profile_role('b8333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('b8444444-4444-4444-8444-444444444444', 'accounts');
select private.apply_profile_role('b8555555-5555-4555-8555-555555555555', 'staff');

-- Admin list/add/disable
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select cmp_ok(
  (select count(*)::int from public.list_signup_email_domains()),
  '>=',
  1,
  'admin can list signup email domains'
);

select is(
  (select domain from public.add_signup_email_domain('  COMPANY.COM  ') limit 1),
  'company.com',
  'add normalizes domain to lowercase without protocol'
);

select throws_ok(
  $$ select public.add_signup_email_domain('not a valid domain') $$,
  'P0001',
  'Invalid email domain',
  'malformed domain rejected'
);

select is(
  (select active from public.set_signup_email_domain_active('company.com', false) limit 1),
  false,
  'admin can disable domain'
);

reset role;
set local role anon;

select is(
  public.classify_signup_email('person@company.com') ->> 'path',
  'external',
  'disabled domain no longer qualifies signup'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select active from public.set_signup_email_domain_active('company.com', true) limit 1),
  true,
  'admin can re-enable domain'
);

reset role;
set local role anon;

select is(
  public.classify_signup_email('person@company.com') ->> 'path',
  'company',
  'enabled domain qualifies signup immediately'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

reset role;

select ok(
  exists (
    select 1
    from private.signup_email_domain_audit a
    where a.domain = 'company.com'
      and a.action in ('added', 'enabled', 'disabled')
  ),
  'domain audit records changes'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- Owner access
select set_config('request.jwt.claims', json_build_object('sub', 'b8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.add_signup_email_domain('owner-domain.test')),
  1,
  'owner can add domain'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.add_signup_email_domain('delete-candidate.test')),
  1,
  'fixture domain for delete tests'
);

select is(
  (select active from public.set_signup_email_domain_active('delete-candidate.test', false) limit 1),
  false,
  'delete candidate disabled before removal'
);

reset role;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'b8666666-6666-4666-8666-666666666666',
  'existing-user@delete-candidate.test',
  '{"full_name":"Existing Domain User"}'
);

select private.apply_profile_role('b8666666-6666-4666-8666-666666666666', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.delete_signup_email_domain('delete-candidate.test') $$,
  'admin can delete disabled domain'
);

reset role;
set local role anon;

select is(
  public.classify_signup_email('new-user@delete-candidate.test') ->> 'path',
  'external',
  'deleted domain no longer qualifies for company signup'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select account_status from public.profiles where id = 'b8666666-6666-4666-8666-666666666666'),
  'active',
  'existing users remain unchanged after domain deletion'
);

reset role;

select ok(
  exists (
    select 1
    from private.signup_email_domain_audit a
    where a.domain = 'delete-candidate.test'
      and a.action = 'deleted'
  ),
  'deletion audit row remains after domain removal'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.delete_signup_email_domain('delete-candidate.test') $$,
  'P0001',
  'Email domain not found',
  'deleted domain cannot be deleted again'
);

select is(
  (select count(*)::int from public.add_signup_email_domain('delete-active.test')),
  1,
  'active delete guard fixture domain'
);

select throws_ok(
  $$ select public.delete_signup_email_domain('delete-active.test') $$,
  'P0001',
  'Disable this domain before deleting it.',
  'cannot delete active domain'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.add_signup_email_domain('owner-delete.test')),
  1,
  'owner delete fixture domain'
);

select is(
  (select active from public.set_signup_email_domain_active('owner-delete.test', false) limit 1),
  false,
  'owner delete fixture disabled'
);

select lives_ok(
  $$ select public.delete_signup_email_domain('owner-delete.test') $$,
  'owner can delete disabled domain'
);

-- HR denied
select set_config('request.jwt.claims', json_build_object('sub', 'b8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.list_signup_email_domains() $$,
  'P0001',
  'Authentication settings management access required',
  'HR cannot list signup email domains'
);

select throws_ok(
  $$ select public.add_signup_email_domain('hr-blocked.test') $$,
  'P0001',
  'Authentication settings management access required',
  'HR cannot add domains'
);

select throws_ok(
  $$ select public.delete_signup_email_domain('company.com') $$,
  'P0001',
  'Authentication settings management access required',
  'HR cannot delete domains'
);

-- Accounts denied
select set_config('request.jwt.claims', json_build_object('sub', 'b8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.list_signup_email_domains() $$,
  'P0001',
  'Authentication settings management access required',
  'accounts cannot list signup domains'
);

select throws_ok(
  $$ select public.delete_signup_email_domain('company.com') $$,
  'P0001',
  'Authentication settings management access required',
  'accounts cannot delete domains'
);

-- Staff denied
select set_config('request.jwt.claims', json_build_object('sub', 'b8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.list_signup_email_domains() $$,
  'P0001',
  'Authentication settings management access required',
  'staff cannot list signup domains'
);

select throws_ok(
  $$ select public.delete_signup_email_domain('company.com') $$,
  'P0001',
  'Authentication settings management access required',
  'staff cannot delete domains'
);

-- Email settings authorization and secret handling
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_email_delivery_settings(
    'smtp',
    'SMTP2Go',
    'mail.smtp2go.com',
    587,
    'starttls',
    'smtp-user',
    'super-secret-password',
    'noreply@example.test',
    'Lunch App',
    '',
    true
  ) $$,
  'admin can update email delivery settings'
);

select is(
  (select smtp_password_configured from public.get_email_delivery_settings() limit 1),
  true,
  'settings payload exposes configured flag not secret'
);

select is(
  (
    select (q.payload -> 'smtp_password') is null
    from (
      select row_to_json(r)::jsonb as payload
      from public.get_email_delivery_settings() r
      limit 1
    ) q
  ),
  true,
  'settings payload never includes smtp_password field'
);

select lives_ok(
  $$ select public.update_email_delivery_settings(
    'smtp',
    'SMTP2Go',
    'mail.smtp2go.com',
    587,
    'starttls',
    'smtp-user',
    '',
    'noreply@example.test',
    'Lunch App',
    '',
    true
  ) $$,
  'blank password preserves existing secret'
);

select lives_ok(
  $$ select public.record_email_delivery_test_result(false, 'SMTP timeout token=secret') $$,
  'admin can record sanitized test failure'
);

select ok(
  (select last_test_error from public.get_email_delivery_settings() limit 1) not like '%secret%',
  'test errors are sanitized'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_email_delivery_settings() $$,
  'P0001',
  'Authentication settings management access required',
  'HR cannot read email delivery settings'
);

reset role;
set local role service_role;

select is(
  (select (smtp_password is not null) from public.service_get_email_delivery_runtime() limit 1),
  true,
  'service runtime includes decrypted secret for server mail only'
);

select * from finish();
rollback;
