begin;

select plan(8);

-- ============================================================
-- Post-migration state
-- ============================================================

select results_eq(
  $$ select count(*)::bigint from public.profiles where role = 'user' $$,
  array[0::bigint],
  'No legacy user roles remain after migration'
);

-- ============================================================
-- Simulate legacy-to-final transition (same steps as migration)
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c1111111-1111-4111-8111-111111111111', 'legacy-user@test.local', '{"full_name":"Legacy User"}'),
  ('c2222222-2222-4222-8222-222222222222', 'role-matrix@test.local', '{"full_name":"Role Matrix"}');

reset role;

alter table public.profiles drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'staff', 'hr', 'accounts', 'admin', 'owner'));

-- Role-guard trigger is installed later in the migration; disable it to mirror
-- section 1 data migration, which runs before the trigger exists.
alter table public.profiles disable trigger guard_profile_role_change;

update public.profiles
set role = 'user'
where id = 'c1111111-1111-4111-8111-111111111111';

select results_eq(
  $$ select role from public.profiles where id = 'c1111111-1111-4111-8111-111111111111' $$,
  array['user'::text],
  'Transitional constraint permits legacy user role'
);

update public.profiles
set role = 'staff'
where role = 'user';

alter table public.profiles enable trigger guard_profile_role_change;

select results_eq(
  $$ select role from public.profiles where id = 'c1111111-1111-4111-8111-111111111111' $$,
  array['staff'::text],
  'Legacy user converts to staff during migration transition'
);

alter table public.profiles drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('staff', 'hr', 'accounts', 'admin', 'owner'));

select throws_ok(
  $$ select private.apply_profile_role('c2222222-2222-4222-8222-222222222222', 'user') $$,
  '23514',
  null,
  'Final schema rejects legacy user role'
);

select lives_ok(
  $$ select private.apply_profile_role('c2222222-2222-4222-8222-222222222222', 'hr') $$,
  'Final schema accepts hr'
);

select lives_ok(
  $$ select private.apply_profile_role('c2222222-2222-4222-8222-222222222222', 'accounts') $$,
  'Final schema accepts accounts'
);

select lives_ok(
  $$ select private.apply_profile_role('c2222222-2222-4222-8222-222222222222', 'admin') $$,
  'Final schema accepts admin'
);

select lives_ok(
  $$ select private.apply_profile_role('c1111111-1111-4111-8111-111111111111', 'owner') $$,
  'Final schema accepts owner'
);

select * from finish();
rollback;
