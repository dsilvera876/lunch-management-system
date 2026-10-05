begin;

select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'active-login@test.local', '{"full_name":"Active"}'),
  ('a2222222-2222-4222-8222-222222222222', 'inactive-login@test.local', '{"full_name":"Inactive"}'),
  ('a3333333-3333-4333-8333-333333333333', 'hr-login-gate@test.local', '{"full_name":"HR Gate"}');

select private.apply_profile_role('a3333333-3333-4333-8333-333333333333', 'hr');

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
    'sub', 'b3333333-3333-4333-8333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);

select is_empty(
  $$ select role, account_status from public.get_authenticated_profile_for_login() $$,
  'auth user without profile returns no login gate row'
);

select * from finish();

rollback;
