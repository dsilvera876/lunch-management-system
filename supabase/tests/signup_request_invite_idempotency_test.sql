begin;

select plan(15);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a8111111-1111-4111-8111-111111111111', 'invite-hr@test.local', '{"full_name":"Invite HR"}'),
  ('a8222222-2222-4222-8222-222222222222', 'invite-adm@test.local', '{"full_name":"Invite Admin"}');

reset role;
select private.apply_profile_role('a8111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('a8222222-2222-4222-8222-222222222222', 'admin');

set local role anon;
select public.request_external_signup('Pending Invite', 'pending-invite@gmail.com');

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select status from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'pending', 1, 0) limit 1)
  ) limit 1),
  'pending',
  'fixture signup request is pending'
);

select is(
  (select count(*)::int from public.mark_signup_request_approved(
    (select request_id from public.search_signup_requests(null, 'pending', 1, 0) limit 1),
    null
  )),
  1,
  'first approval returns request row'
);

select is(
  (select count(*)::int from public.mark_signup_request_approved(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1),
    null
  )),
  1,
  'second approval resumes instead of failing'
);

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
  'a8333333-3333-4333-8333-333333333333',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'pending-invite@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Pending Invite"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$
    select public.link_signup_request_profile(
      (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1),
      'a8333333-3333-4333-8333-333333333333',
      null
    )
  $$,
  'link succeeds when profile exists'
);

select is(
  (select created_profile_id::text from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
  )),
  'a8333333-3333-4333-8333-333333333333',
  'approved request stores linked profile id'
);

select is(
  (select invite_sent_at is null from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
  )),
  true,
  'linking profile alone does not mark invite_sent_at'
);

select lives_ok(
  $$
    select public.record_signup_invite_delivered(
      (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
    )
  $$,
  'record_signup_invite_delivered succeeds for approved request'
);

select is(
  (select invite_sent_at is not null from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
  )),
  true,
  'record_signup_invite_delivered sets invite_sent_at'
);

select lives_ok(
  $$
    select public.link_signup_request_profile(
      (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1),
      'a8333333-3333-4333-8333-333333333333',
      null
    )
  $$,
  're-link with same profile is idempotent'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$
    select public.link_signup_request_profile(
      (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1),
      null,
      'SMTP timeout token=secret-value'
    )
  $$,
  'invite failure records sanitized error while staying approved'
);

select is(
  (select status from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
  ) limit 1),
  'approved',
  'invite failure does not revert request to pending'
);

select ok(
  (select invite_last_error from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
  )) like '%SMTP timeout%',
  'invite_last_error retains troubleshooting detail'
);

select ok(
  (select invite_last_error from public.get_signup_request(
    (select request_id from public.search_signup_requests(null, 'approved', 1, 0) limit 1)
  )) not like '%secret-value%',
  'invite_last_error redacts secret-like values'
);

-- duplicate Employee ID before approval on a fresh request
reset role;

set local role anon;
select public.request_external_signup('Duplicate ID', 'duplicate-id@gmail.com');

reset role;

select private.apply_profile_role('a8111111-1111-4111-8111-111111111111', 'hr');
select public.set_employee_id('a8111111-1111-4111-8111-111111111111', '0099');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.mark_signup_request_approved(
    (select request_id from public.search_signup_requests('duplicate-id@gmail.com', 'pending', 1, 0) limit 1),
    '0099'
  ) $$,
  'P0001',
  'Employee ID 0099 is already assigned to another user',
  'duplicate Employee ID blocked before invite orchestration'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.mark_signup_request_approved(
    (select request_id from public.search_signup_requests('duplicate-id@gmail.com', 'pending', 1, 0) limit 1),
    null
  ) $$,
  'P0001',
  'Signup request management access required',
  'non-HR cannot resume signup approval'
);

select * from finish();
rollback;
