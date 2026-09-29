begin;

select plan(16);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e1111111-1111-4111-8111-111111111111', 'onboard-hr@test.local', '{"full_name":"Onboard HR"}'),
  ('e1222222-2222-4222-8222-222222222222', 'onboard-staff@test.local', '{"full_name":"Legacy Staff"}');

reset role;
select private.apply_profile_role('e1111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('e1222222-2222-4222-8222-222222222222', 'staff');

set local role anon;
select public.request_external_signup('Invite Stub', 'invite-stub@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'invite-stub@gmail.com' limit 1),
  null
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
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'e1999999-9999-4999-8999-999999999999',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'invite-stub@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  null,
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Invite Stub"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.link_signup_request_profile(
  (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
   where email = 'invite-stub@gmail.com' limit 1),
  'e1999999-9999-4999-8999-999999999999',
  null
);

select is(
  (
    select onboarding_established
    from public.search_signup_requests('invite-stub@gmail.com', 'approved', 10, 0)
    limit 1
  ),
  false,
  'onboarding marker unset after invite/profile link'
);

reset role;

update auth.users au
set
  email_confirmed_at = now(),
  last_sign_in_at = null
where au.id = 'e1999999-9999-4999-8999-999999999999';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select onboarding_established
    from public.search_signup_requests('invite-stub@gmail.com', 'approved', 10, 0)
    limit 1
  ),
  false,
  'email confirmation alone does not set onboarding completion marker'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1999999-9999-4999-8999-999999999999', 'role', 'authenticated')::text,
  true
);

select is(
  (select private.current_user_id()),
  null,
  'linked invite with confirmed email but no completion marker has no application user id'
);

select throws_ok(
  format(
    $$ select public.submit_order(%L::uuid, '[]'::jsonb) $$,
    (select id from public.lunch_days limit 1)
  ),
  'Authentication required',
  'incomplete onboarding cannot submit orders'
);

select is(
  (public.complete_signup_onboarding() ->> 'code'),
  'completed',
  'invited user completes application onboarding marker'
);

select is(
  (public.complete_signup_onboarding() ->> 'code'),
  'already_completed',
  'completion RPC is idempotent'
);

select is(
  (select private.current_user_id()),
  'e1999999-9999-4999-8999-999999999999'::uuid,
  'application access enabled after onboarding marker is set'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select outcome_code
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
       where email = 'invite-stub@gmail.com' limit 1),
      'other',
      null
    )
  ),
  'completed',
  'HR cannot cancel after onboarding marker is set'
);

-- Legacy staff without signup request remains unaffected
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select is(
  (select private.current_user_id()),
  'e1222222-2222-4222-8222-222222222222'::uuid,
  'profiles without pending signup onboarding keep application access'
);

select is(
  (public.complete_signup_onboarding() ->> 'code'),
  'no_signup_request',
  'completion RPC is harmless for users without linked signup requests'
);

-- Partial Auth state: confirmed email, no marker, HR can still cancel
reset role;

set local role anon;
select public.request_external_signup('Partial Setup', 'partial-setup@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'partial-setup@gmail.com' limit 1),
  null
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
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'e1888888-8888-4888-8888-888888888888',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'partial-setup@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  now(),
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Partial Setup"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.link_signup_request_profile(
  (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
   where email = 'partial-setup@gmail.com' limit 1),
  'e1888888-8888-4888-8888-888888888888',
  null
);

select is(
  (
    select outcome_code
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
       where email = 'partial-setup@gmail.com' limit 1),
      'no_longer_needed',
      null
    )
  ),
  'auth_cleanup_required',
  'HR can cancel when Auth email is confirmed but onboarding marker is still null'
);

select is(
  (
    select onboarding_established
    from public.search_signup_requests('partial-setup@gmail.com', 'approved', 10, 0)
    limit 1
  ),
  false,
  'search onboarding_established follows application marker not Auth timestamps'
);

-- Auth invite OTP can set confirmed + last_sign_in without application onboarding marker
reset role;

update auth.users au
set
  email_confirmed_at = coalesce(au.email_confirmed_at, now()),
  last_sign_in_at = coalesce(au.last_sign_in_at, now())
where au.id = 'e1888888-8888-4888-8888-888888888888';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1888888-8888-4888-8888-888888888888', 'role', 'authenticated')::text,
  true
);

select is(
  (select private.current_user_id()),
  null,
  'Auth confirmed + sign-in without onboarding marker still blocks application access'
);

reset role;

select is(
  private.signup_onboarding_backfill_eligible('e1888888-8888-4888-8888-888888888888'),
  false,
  'Auth timestamps alone do not make signup onboarding backfill eligible'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1888888-8888-4888-8888-888888888888', 'role', 'authenticated')::text,
  true
);

select is(
  (public.complete_signup_onboarding(true) ->> 'ok'),
  'false',
  'invite setup requires linked approved signup request'
);

select is(
  (public.complete_signup_onboarding(false) ->> 'code'),
  'no_signup_request',
  'non-invite completion remains permissive without linked signup request'
);

select * from finish();

rollback;
