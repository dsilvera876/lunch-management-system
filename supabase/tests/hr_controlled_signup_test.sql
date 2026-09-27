begin;

select plan(15);

\ir support/isolate_existing_owner.inc

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f1111111-1111-4111-8111-111111111111', 'signup-hr@test.local', '{"full_name":"Signup HR"}'),
  ('f2222222-2222-4222-8222-222222222222', 'signup-adm@test.local', '{"full_name":"Signup Admin"}'),
  ('f3333333-3333-4333-8333-333333333333', 'inactive-staff@test.local', '{"full_name":"Inactive Staff"}');

reset role;
select private.apply_profile_role('f1111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('f2222222-2222-4222-8222-222222222222', 'admin');

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'f3333333-3333-4333-8333-333333333333';
select private.deactivate_trusted_account_status_change();

-- ============================================================
-- Domain classification
-- ============================================================

set local role anon;

select is(
  public.classify_signup_email('not-an-email') ->> 'ok',
  'false',
  'invalid email shape is rejected by classify'
);

select is(
  public.classify_signup_email('  Person@Example.TEST  ') ->> 'path',
  'company',
  'company domain classification uses normalized domain'
);

select is(
  public.classify_signup_email('person@gmail.com') ->> 'path',
  'external',
  'non-configured domains classify as external'
);

select is(
  public.classify_signup_email('person@company.com.attacker.example') ->> 'path',
  'external',
  'suffix domains do not match configured company domain'
);

-- ============================================================
-- External signup request RPC
-- ============================================================

select is(
  (public.request_external_signup('Alex External', 'alex@gmail.com') ->> 'code'),
  'submitted',
  'external request creates pending signup request'
);

select is(
  (public.request_external_signup('Alex External', 'alex@gmail.com') ->> 'code'),
  'already_pending',
  'duplicate pending external request returns already_pending'
);

select is(
  (public.request_external_signup('Company Person', 'newhire@example.test') ->> 'code'),
  'company_email',
  'company-domain addresses cannot use external request RPC'
);

reset role;

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'f3333333-3333-4333-8333-333333333333';
select private.deactivate_trusted_account_status_change();

set local role anon;

select is(
  (public.request_external_signup('Inactive Retry', 'inactive-staff@test.local') ->> 'code'),
  'unavailable',
  'inactive existing accounts cannot submit a new external signup request'
);

-- ============================================================
-- HR-only signup request management (before approval consumes pending row)
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from public.search_signup_requests() $$,
  'P0001',
  'Signup request management access required',
  'Admin cannot list signup requests'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  (select public.count_pending_signup_requests()) >= 1,
  'HR can count pending signup requests'
);

-- ============================================================
-- Auth hook enforcement
-- ============================================================

reset role;

select is(
  public.hook_before_user_created(
    jsonb_build_object(
      'user', jsonb_build_object('email', 'allowed@example.test')
    )
  ),
  '{}'::jsonb,
  'hook allows active company-domain signup'
);

select ok(
  (public.hook_before_user_created(
    jsonb_build_object(
      'user', jsonb_build_object('email', 'blocked@gmail.com')
    )
  ) -> 'error' ->> 'message') is not null,
  'hook blocks external email without approval'
);

reset role;

update private.signup_requests
set status = 'approved',
    reviewed_at = now(),
    reviewed_by = 'f1111111-1111-4111-8111-111111111111'
where normalized_email = 'alex@gmail.com';

select is(
  public.hook_before_user_created(
    jsonb_build_object(
      'user', jsonb_build_object('email', 'alex@gmail.com')
    )
  ),
  '{}'::jsonb,
  'hook allows external email with approved signup request'
);

select ok(
  (public.hook_before_user_created(
    jsonb_build_object(
      'user', jsonb_build_object('email', 'inactive-staff@test.local')
    )
  ) -> 'error' ->> 'message') is not null,
  'hook blocks signup when application account already exists'
);

-- ============================================================
-- Profile role hardening on self-signup metadata
-- ============================================================

reset role;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'f5555555-5555-4555-8555-555555555555',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'staff-only@example.test',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Staff Only', 'role', 'owner'),
  now(),
  now(),
  false,
  false
);

select is(
  (select role from public.profiles where id = 'f5555555-5555-4555-8555-555555555555'),
  'staff',
  'profile creation ignores elevated role in user metadata'
);

select * from finish();
rollback;
