begin;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'active-login@test.local', '{"full_name":"Active"}'),
  ('a2222222-2222-4222-8222-222222222222', 'inactive-login@test.local', '{"full_name":"Inactive"}'),
  ('a3333333-3333-4333-8333-333333333333', 'hr-login-gate@test.local', '{"full_name":"HR Gate"}'),
  ('a4444444-4444-4444-8444-444444444444', 'incomplete-external@gmail.com', '{"full_name":"Incomplete External"}'),
  ('a5555555-5555-4555-8555-555555555555', 'completed-external@gmail.com', '{"full_name":"Completed External"}');

select private.apply_profile_role('a3333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('a4444444-4444-4444-8444-444444444444', 'hr');
select private.apply_profile_role('a5555555-5555-4555-8555-555555555555', 'hr');

insert into private.signup_requests (
  id,
  email,
  normalized_email,
  full_name,
  status,
  reviewed_at,
  created_profile_id,
  onboarding_completed_at
)
values
  (
    'b4444444-4444-4444-8444-444444444444',
    'incomplete-external@gmail.com',
    'incomplete-external@gmail.com',
    'Incomplete External',
    'approved',
    now(),
    'a4444444-4444-4444-8444-444444444444',
    null
  ),
  (
    'b5555555-5555-4555-8555-555555555555',
    'completed-external@gmail.com',
    'completed-external@gmail.com',
    'Completed External',
    'approved',
    now(),
    'a5555555-5555-4555-8555-555555555555',
    now()
  );

reset role;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a3333333-3333-4333-8333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);

select public.set_staff_active_status('a2222222-2222-4222-8222-222222222222', 'inactive');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select role::text from public.get_authenticated_profile_for_login() $$,
  array['staff'::text],
  'active user resolves role for login gate'
);

select results_eq(
  $$ select account_status::text from public.get_authenticated_profile_for_login() $$,
  array['active'::text],
  'active user resolves account_status for login gate'
);

select results_eq(
  $$ select onboarding_pending from public.get_authenticated_profile_for_login() $$,
  array[false],
  'ordinary active Staff without a signup request is not onboarding-pending'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a3333333-3333-4333-8333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select onboarding_pending from public.get_authenticated_profile_for_login() $$,
  array[false],
  'ordinary active HR without a signup request is not onboarding-pending'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select role::text from public.get_authenticated_profile_for_login() $$,
  array['staff'::text],
  'inactive user resolves role for login gate'
);

select results_eq(
  $$ select account_status::text from public.get_authenticated_profile_for_login() $$,
  array['inactive'::text],
  'inactive user resolves account_status for login gate'
);

select is_empty(
  $$
    select 1
    from public.profiles
    where id = 'a2222222-2222-4222-8222-222222222222'
  $$,
  'inactive user cannot self-read profile row through RLS'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a4444444-4444-4444-8444-444444444444',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select onboarding_pending from public.get_authenticated_profile_for_login() $$,
  array[true],
  'approved linked external account exposes incomplete onboarding to the login gate'
);

select is(
  (select private.current_user_id()),
  null,
  'incomplete external onboarding remains blocked by application authorization'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a5555555-5555-4555-8555-555555555555',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select onboarding_pending from public.get_authenticated_profile_for_login() $$,
  array[false],
  'completed external onboarding is allowed by the login gate'
);

select is(
  (select private.current_user_id()),
  'a5555555-5555-4555-8555-555555555555'::uuid,
  'completed external onboarding retains normal application authorization'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'b3333333-3333-4333-8333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);

select is_empty(
  $$ select role, account_status, onboarding_pending from public.get_authenticated_profile_for_login() $$,
  'auth user without profile returns no login gate row'
);

select * from finish();

rollback;
