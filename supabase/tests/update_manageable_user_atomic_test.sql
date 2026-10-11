begin;

select plan(27);

\ir support/isolate_existing_owner.inc

-- ============================================================
-- Fixtures
--   ae11 Owner   ae22 Admin   ae33 Staff target   ae44 HR
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ae111111-1111-4111-8111-111111111111', 'atomic-owner@test.local', '{"full_name":"Atomic Owner"}'),
  ('ae222222-2222-4222-8222-222222222222', 'atomic-admin@test.local', '{"full_name":"Atomic Admin"}'),
  ('ae333333-3333-4333-8333-333333333333', 'atomic-target@test.local', '{"full_name":"Original Name"}'),
  ('ae444444-4444-4444-8444-444444444444', 'atomic-hr@test.local', '{"full_name":"Atomic HR"}');

select public.bootstrap_first_owner('ae111111-1111-4111-8111-111111111111');
select private.apply_profile_role('ae222222-2222-4222-8222-222222222222', 'admin');
select private.apply_profile_role('ae444444-4444-4444-8444-444444444444', 'hr');

create temporary view atomic_target_state as
  select
    p.full_name,
    p.role,
    (select count(*)
     from private.profile_role_change_audit a
     where a.target_profile_id = p.id
       and a.action = 'role_assignment')::bigint as role_audit_count
  from public.profiles p
  where p.id = 'ae333333-3333-4333-8333-333333333333';
grant select on atomic_target_state to authenticated;

select has_function(
  'public', 'update_manageable_user', array['uuid', 'text', 'text'],
  'Atomic manageable user update RPC exists'
);

select ok(
  has_function_privilege('authenticated', 'public.update_manageable_user(uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.update_manageable_user(uuid,text,text)', 'execute'),
  'Atomic update is executable by authenticated users only'
);

-- ============================================================
-- Rejected role changes do not save the submitted name
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ae222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Renamed Invalid', 'owner') $$,
  'P0001', 'Invalid assignable role',
  'Admin cannot assign Owner through the combined update'
);

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('Original Name'::text, 'staff'::text, 0::bigint) $$,
  'Invalid role rejection leaves the name unchanged'
);

select throws_ok(
  $$ select public.update_manageable_user('ae111111-1111-4111-8111-111111111111', 'Renamed Owner', 'admin') $$,
  'P0001', 'Owner role cannot be changed through role assignment',
  'Combined update cannot demote the Owner'
);

reset role;

select results_eq(
  $$ select full_name, role from public.profiles where id = 'ae111111-1111-4111-8111-111111111111' $$,
  $$ values ('Atomic Owner'::text, 'owner'::text) $$,
  'Owner protection rejection leaves the Owner name unchanged'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ae222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'atomic update support test') $$,
  'Admin starts Support Mode'
);

select throws_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Renamed In Support', 'hr') $$,
  'P0001', 'Role management is unavailable in Support Mode',
  'Combined role change is rejected in Support Mode'
);

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('Original Name'::text, 'staff'::text, 0::bigint) $$,
  'Support Mode rejection leaves the name and role unchanged'
);

select lives_ok($$ select public.end_support_session() $$, 'Admin ends Support Mode');

select set_config('request.jwt.claims',
  json_build_object('sub', 'ae444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Renamed By HR', 'hr') $$,
  'P0001', 'Role management access required',
  'HR cannot use the combined role-manager update'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ae222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_manageable_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nobody', 'hr') $$,
  'P0001', 'Profile does not exist',
  'Combined update rejects a missing profile'
);

select throws_ok(
  $$
    do $rollback$
    begin
      perform public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Rolled Back', 'accounts');
      raise exception 'forced rollback after combined update';
    end;
    $rollback$
  $$,
  'P0001', 'forced rollback after combined update',
  'A combined update followed by a failure rolls back'
);

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('Original Name'::text, 'staff'::text, 0::bigint) $$,
  'Rejected and rolled-back combined updates leave no name, role, or audit changes'
);

-- ============================================================
-- Successful combined and name-only edits
-- ============================================================

select lives_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', '  New Name  ', 'hr') $$,
  'Admin saves name and role together'
);

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('New Name'::text, 'hr'::text, 1::bigint) $$,
  'Combined update saves the trimmed name, the new role, and one audit row'
);

select lives_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Name Only', 'hr') $$,
  'Admin saves a name change with the role unchanged'
);

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('Name Only'::text, 'hr'::text, 1::bigint) $$,
  'Name-only edit does not create a role audit row'
);

select lives_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'No Role Arg', null) $$,
  'Null role performs a name-only edit'
);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'atomic name-only support test') $$,
  'Admin starts Support Mode again'
);

select lives_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Support Name Edit', 'hr') $$,
  'Name-only edit keeps existing behavior in Support Mode'
);

select lives_ok($$ select public.end_support_session() $$, 'Admin ends Support Mode again');

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('Support Name Edit'::text, 'hr'::text, 1::bigint) $$,
  'Name-only edits change the name without touching role or audit'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ae111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_manageable_user('ae111111-1111-4111-8111-111111111111', 'Renamed Owner', null) $$,
  'Owner can rename themselves without a role change'
);

select lives_ok(
  $$ select public.update_manageable_user('ae333333-3333-4333-8333-333333333333', 'Owner Edit', 'admin') $$,
  'Owner can promote a user and rename them together'
);

reset role;

select results_eq(
  $$ select full_name, role, role_audit_count from atomic_target_state $$,
  $$ values ('Owner Edit'::text, 'admin'::text, 2::bigint) $$,
  'Owner combined update saves both changes and audits the role change'
);

select results_eq(
  $$ select full_name, role from public.profiles where id = 'ae111111-1111-4111-8111-111111111111' $$,
  $$ values ('Renamed Owner'::text, 'owner'::text) $$,
  'Owner self-rename keeps the Owner role'
);

select * from finish();
rollback;
