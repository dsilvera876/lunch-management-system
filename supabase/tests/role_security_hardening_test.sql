begin;

select plan(24);

\ir support/isolate_existing_owner.inc

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b1111111-1111-4111-8111-111111111111', 'bootstrap@test.local', '{"full_name":"Bootstrap Candidate"}'),
  ('b2222222-2222-4222-8222-222222222222', 'staff-sec@test.local', '{"full_name":"Staff Security"}'),
  ('b3333333-3333-4333-8333-333333333333', 'owner-sec@test.local', '{"full_name":"Owner Security"}'),
  ('b4444444-4444-4444-8444-444444444444', 'normal-sec@test.local', '{"full_name":"Normal Security"}');

reset role;

-- ============================================================
-- Single Owner integrity / bootstrap
-- ============================================================

select results_eq(
  $$ select count(*)::bigint from public.profiles where role = 'owner' $$,
  array[0::bigint],
  'Zero Owners allowed before bootstrap'
);

select throws_ok(
  $$ select public.bootstrap_first_owner('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'P0001',
  'Target profile does not exist',
  'Bootstrap fails clearly when target profile is missing'
);

select lives_ok(
  $$ select public.bootstrap_first_owner('b3333333-3333-4333-8333-333333333333') $$,
  'Bootstrap promotes first Owner atomically'
);

select results_eq(
  $$ select role from public.profiles where id = 'b3333333-3333-4333-8333-333333333333' $$,
  array['owner'::text],
  'Bootstrap leaves target profile as Owner'
);

select throws_ok(
  $$ select public.bootstrap_first_owner('b1111111-1111-4111-8111-111111111111') $$,
  'P0001',
  'An Owner already exists',
  'Bootstrap fails clearly when an Owner already exists'
);

select throws_ok(
  $$ select private.apply_profile_role('b1111111-1111-4111-8111-111111111111', 'owner') $$,
  '23505',
  null,
  'Direct creation of second Owner fails'
);

-- ============================================================
-- GUC / bypass attempts (application-accessible paths)
-- ============================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'b2222222-2222-4222-8222-222222222222' $$,
  'P0001',
  'Role changes must use assign_user_role or transfer_ownership',
  'Direct profile role update is blocked for authenticated users'
);

select throws_ok(
  $$
    select set_config('app.allow_role_change', 'true', true);
    update public.profiles set role = 'admin' where id = 'b2222222-2222-4222-8222-222222222222';
  $$,
  'P0001',
  'Role changes must use assign_user_role or transfer_ownership',
  'Legacy allow_role_change GUC cannot bypass profile guard'
);

select throws_ok(
  $$
    select set_config('app.role_change_gate', 'true', true);
    update public.profiles set role = 'admin' where id = 'b2222222-2222-4222-8222-222222222222';
  $$,
  'P0001',
  'Role changes must use assign_user_role or transfer_ownership',
  'Guessed role_change_gate GUC cannot bypass profile guard'
);

select throws_ok(
  $$ select private.apply_profile_role('b2222222-2222-4222-8222-222222222222', 'admin') $$,
  '42501',
  null,
  'Authenticated users cannot execute trusted apply_profile_role'
);

select throws_ok(
  $$ select private.activate_trusted_role_change() $$,
  '42501',
  null,
  'Authenticated users cannot execute trusted role-change activator'
);

select results_eq(
  $$ select role from public.profiles where id = 'b2222222-2222-4222-8222-222222222222' $$,
  array['staff'::text],
  'Staff role remains unchanged after bypass attempts'
);

select throws_ok(
  $$ select public.bootstrap_first_owner('b2222222-2222-4222-8222-222222222222') $$,
  '42501',
  null,
  'Authenticated users cannot execute bootstrap_first_owner'
);

-- ============================================================
-- Ownership transfer integrity
-- ============================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.transfer_ownership('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'P0001',
  'Target profile does not exist',
  'Failed transfer leaves original Owner unchanged'
);

select results_eq(
  $$ select role from public.profiles where id = 'b3333333-3333-4333-8333-333333333333' $$,
  array['owner'::text],
  'Original Owner remains Owner after failed transfer'
);

select lives_ok(
  $$ select public.transfer_ownership('b1111111-1111-4111-8111-111111111111') $$,
  'Successful transfer is atomic'
);

select results_eq(
  $$ select role from public.profiles where id = 'b1111111-1111-4111-8111-111111111111' $$,
  array['owner'::text],
  'Transfer promotes target to Owner'
);

select results_eq(
  $$ select role from public.profiles where id = 'b3333333-3333-4333-8333-333333333333' $$,
  array['admin'::text],
  'Transfer demotes former Owner to Admin'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where role = 'owner' $$,
  array[1::bigint],
  'Exactly one Owner exists after successful transfer'
);

-- ============================================================
-- auth.users cascade deletion behavior
-- ============================================================

reset role;

select throws_ok(
  $$ delete from auth.users where id = 'b1111111-1111-4111-8111-111111111111' $$,
  'P0001',
  'Owner profile cannot be deleted',
  'Deleting Owner auth.users row is blocked by profile guard trigger'
);

select results_eq(
  $$ select count(*)::bigint from auth.users where id = 'b1111111-1111-4111-8111-111111111111' $$,
  array[1::bigint],
  'Owner auth.users row remains when deletion is rejected'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where id = 'b1111111-1111-4111-8111-111111111111' $$,
  array[1::bigint],
  'Owner profile row remains when auth.users deletion is rejected'
);

select lives_ok(
  $$ delete from auth.users where id = 'b4444444-4444-4444-8444-444444444444' $$,
  'Non-Owner auth.users deletion succeeds'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where id = 'b4444444-4444-4444-8444-444444444444' $$,
  array[0::bigint],
  'Non-Owner profile is cascade-deleted with auth.users row'
);

select * from finish();
rollback;
