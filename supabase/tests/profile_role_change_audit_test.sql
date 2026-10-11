begin;

select plan(56);

\ir support/isolate_existing_owner.inc

-- ============================================================
-- Fixtures
--   ad11 Owner (bootstrapped)   ad22 Admin   ad33 Staff -> HR target
--   ad44 HR   ad55 Accounts   ad66 Staff (transfer target)
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ad111111-1111-4111-8111-111111111111', 'audit-owner@test.local', '{"full_name":"Audit Owner"}'),
  ('ad222222-2222-4222-8222-222222222222', 'audit-admin@test.local', '{"full_name":"Audit Admin"}'),
  ('ad333333-3333-4333-8333-333333333333', 'audit-target@test.local', '{"full_name":"Audit Target"}'),
  ('ad444444-4444-4444-8444-444444444444', 'audit-hr@test.local', '{"full_name":"Audit HR"}'),
  ('ad555555-5555-4555-8555-555555555555', 'audit-accounts@test.local', '{"full_name":"Audit Accounts"}'),
  ('ad666666-6666-4666-8666-666666666666', 'audit-successor@test.local', '{"full_name":"Audit Successor"}');

select public.bootstrap_first_owner('ad111111-1111-4111-8111-111111111111');
select private.apply_profile_role('ad222222-2222-4222-8222-222222222222', 'admin');
select private.apply_profile_role('ad444444-4444-4444-8444-444444444444', 'hr');
select private.apply_profile_role('ad555555-5555-4555-8555-555555555555', 'accounts');

create temporary table audit_fixture_ids (id uuid primary key) on commit drop;
insert into audit_fixture_ids values
  ('ad111111-1111-4111-8111-111111111111'),
  ('ad222222-2222-4222-8222-222222222222'),
  ('ad333333-3333-4333-8333-333333333333'),
  ('ad444444-4444-4444-8444-444444444444'),
  ('ad555555-5555-4555-8555-555555555555'),
  ('ad666666-6666-4666-8666-666666666666');
grant select on audit_fixture_ids to authenticated;

-- Superuser view of audit rows for fixture profiles (tests read it after reset role).
create temporary view fixture_role_audit as
  select a.*
  from private.profile_role_change_audit a
  where a.target_profile_id in (select id from audit_fixture_ids);

-- ============================================================
-- Schema and privileged paths
-- ============================================================

select has_table('private', 'profile_role_change_audit', 'Role change audit table exists in private schema');

select results_eq(
  $$ select action, actor_profile_id, previous_role, new_role
     from fixture_role_audit
     where target_profile_id = 'ad111111-1111-4111-8111-111111111111' $$,
  $$ values ('owner_bootstrap'::text, null::uuid, 'staff'::text, 'owner'::text) $$,
  'Owner bootstrap is audited without an application actor'
);

select results_eq(
  $$ select action, actor_profile_id, previous_role, new_role
     from fixture_role_audit
     where target_profile_id = 'ad222222-2222-4222-8222-222222222222' $$,
  $$ values ('system_role_change'::text, null::uuid, 'staff'::text, 'admin'::text) $$,
  'Unlabeled privileged role changes are still audited as system changes'
);

-- ============================================================
-- Successful authorized role change (Admin)
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ad222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.assign_user_role('ad333333-3333-4333-8333-333333333333', 'hr') $$,
  'Admin can assign HR role'
);

reset role;

select results_eq(
  $$ select action, actor_profile_id, previous_role, new_role,
            ownership_transfer_id, previous_owner_id, new_owner_id, created_at is not null
     from fixture_role_audit
     where target_profile_id = 'ad333333-3333-4333-8333-333333333333' $$,
  $$ values ('role_assignment'::text, 'ad222222-2222-4222-8222-222222222222'::uuid,
             'staff'::text, 'hr'::text, null::uuid, null::uuid, null::uuid, true) $$,
  'Role assignment audit records actor, target, roles, action, and timestamp'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ad222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.assign_user_role('ad333333-3333-4333-8333-333333333333', 'hr') $$,
  'Assigning the current role is a no-op'
);

select lives_ok(
  $$ select public.assign_user_role('ad333333-3333-4333-8333-333333333333', 'accounts') $$,
  'Admin can change HR to Accounts'
);

select lives_ok(
  $$ select public.assign_user_role('ad333333-3333-4333-8333-333333333333', 'admin') $$,
  'Admin can promote a user to Admin'
);

select lives_ok(
  $$ select public.assign_user_role('ad333333-3333-4333-8333-333333333333', 'staff') $$,
  'Admin can demote an Admin to Staff'
);

reset role;

select results_eq(
  $$ select previous_role || '>' || new_role
     from fixture_role_audit
     where target_profile_id = 'ad333333-3333-4333-8333-333333333333'
     order by created_at, previous_role = 'staff' desc, previous_role = 'hr' desc, previous_role = 'accounts' desc $$,
  array['staff>hr', 'hr>accounts', 'accounts>admin', 'admin>staff'],
  'Each real promotion and demotion is audited once; the no-op is not'
);

-- ============================================================
-- Unauthorized role changes
-- ============================================================

set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'admin') $$,
  'P0001', 'Role management access required',
  'HR cannot assign roles'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'admin') $$,
  'P0001', 'Role management access required',
  'Accounts cannot assign roles'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'admin') $$,
  'P0001', 'Role management access required',
  'Staff cannot promote themselves'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.assign_user_role('ad111111-1111-4111-8111-111111111111', 'staff') $$,
  'P0001', 'Owner role cannot be changed through role assignment',
  'Admin cannot demote the Owner through role assignment'
);
select throws_ok(
  $$ select public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'owner') $$,
  'P0001', 'Invalid assignable role',
  'Owner role cannot be assigned through role assignment'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.assign_user_role('ad111111-1111-4111-8111-111111111111', 'admin') $$,
  'P0001', 'Owner role cannot be changed through role assignment',
  'Owner cannot demote themselves through role assignment'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from fixture_role_audit
     where target_profile_id in ('ad666666-6666-4666-8666-666666666666', 'ad111111-1111-4111-8111-111111111111')
       and action = 'role_assignment' $$,
  array[0::bigint],
  'Unauthorized role changes produce no audit records'
);

select results_eq(
  $$ select role from public.profiles where id = 'ad666666-6666-4666-8666-666666666666' $$,
  array['staff'::text],
  'Target role is unchanged after unauthorized attempts'
);

-- ============================================================
-- Unauthorized ownership transfers
-- ============================================================

set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.transfer_ownership('ad222222-2222-4222-8222-222222222222') $$,
  'P0001', 'Only the current Owner may transfer ownership',
  'Admin cannot take ownership'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.transfer_ownership('ad444444-4444-4444-8444-444444444444') $$,
  'P0001', 'Only the current Owner may transfer ownership',
  'HR cannot take ownership'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.transfer_ownership('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'P0001', 'Target profile does not exist',
  'Owner transfer to a missing profile fails'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from private.profile_role_change_audit where action = 'ownership_transfer' $$,
  array[0::bigint],
  'Unauthorized or failed ownership transfers produce no audit records'
);

-- ============================================================
-- Support Mode cannot mutate roles or ownership
-- ============================================================

set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from public.start_support_session('hr', 'role audit support test') $$,
  'Admin starts HR Support Mode'
);
select throws_ok(
  $$ select public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'hr') $$,
  'P0001', 'Role management is unavailable in Support Mode',
  'Admin in Support Mode cannot assign roles'
);
select throws_ok(
  $$ select * from public.list_profile_role_change_audit() $$,
  'P0001', 'Role change audit is unavailable in Support Mode',
  'Admin in Support Mode cannot read the role change audit'
);
select lives_ok($$ select public.end_support_session() $$, 'Admin ends Support Mode');

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from public.start_support_session('accounts', 'role audit support test') $$,
  'Owner starts Accounts Support Mode'
);
select throws_ok(
  $$ select public.transfer_ownership('ad666666-6666-4666-8666-666666666666') $$,
  'P0001', 'Ownership transfer is unavailable in Support Mode',
  'Owner in Support Mode cannot transfer ownership'
);
select throws_ok(
  $$ select public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'hr') $$,
  'P0001', 'Role management is unavailable in Support Mode',
  'Owner in Support Mode cannot assign roles'
);
select lives_ok($$ select public.end_support_session() $$, 'Owner ends Support Mode');

reset role;

select results_eq(
  $$ select role from public.profiles where id in (
       'ad111111-1111-4111-8111-111111111111', 'ad666666-6666-4666-8666-666666666666')
     order by id $$,
  array['owner'::text, 'staff'::text],
  'Roles are unchanged after Support Mode attempts'
);

select results_eq(
  $$ select count(*)::bigint from fixture_role_audit
     where target_profile_id = 'ad666666-6666-4666-8666-666666666666' $$,
  array[0::bigint],
  'Support Mode attempts produce no audit records'
);

-- ============================================================
-- Transaction rollback
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ad222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    do $rollback$
    begin
      perform public.assign_user_role('ad666666-6666-4666-8666-666666666666', 'accounts');
      raise exception 'forced rollback after role change';
    end;
    $rollback$
  $$,
  'P0001', 'forced rollback after role change',
  'A role change followed by a failure rolls back'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    do $rollback$
    begin
      perform public.transfer_ownership('ad666666-6666-4666-8666-666666666666');
      raise exception 'forced rollback after transfer';
    end;
    $rollback$
  $$,
  'P0001', 'forced rollback after transfer',
  'An ownership transfer followed by a failure rolls back'
);

reset role;

select results_eq(
  $$ select role from public.profiles where id in (
       'ad111111-1111-4111-8111-111111111111', 'ad666666-6666-4666-8666-666666666666')
     order by id $$,
  array['owner'::text, 'staff'::text],
  'Rolled-back mutations leave roles unchanged'
);

select results_eq(
  $$ select count(*)::bigint from private.profile_role_change_audit
     where target_profile_id = 'ad666666-6666-4666-8666-666666666666'
        or action = 'ownership_transfer' $$,
  array[0::bigint],
  'Rolled-back mutations leave no audit records'
);

-- ============================================================
-- Successful ownership transfer
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ad111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.transfer_ownership('ad666666-6666-4666-8666-666666666666') $$,
  'Owner transfers ownership'
);

reset role;

select results_eq(
  $$ select count(*)::bigint, count(distinct ownership_transfer_id)::bigint
     from private.profile_role_change_audit where action = 'ownership_transfer' $$,
  $$ values (2::bigint, 1::bigint) $$,
  'Ownership transfer records both role changes under one transfer id'
);

select results_eq(
  $$ select target_profile_id, previous_role, new_role, actor_profile_id, previous_owner_id, new_owner_id
     from private.profile_role_change_audit
     where action = 'ownership_transfer'
     order by new_role $$,
  $$ values
       ('ad111111-1111-4111-8111-111111111111'::uuid, 'owner'::text, 'admin'::text,
        'ad111111-1111-4111-8111-111111111111'::uuid,
        'ad111111-1111-4111-8111-111111111111'::uuid, 'ad666666-6666-4666-8666-666666666666'::uuid),
       ('ad666666-6666-4666-8666-666666666666'::uuid, 'staff'::text, 'owner'::text,
        'ad111111-1111-4111-8111-111111111111'::uuid,
        'ad111111-1111-4111-8111-111111111111'::uuid, 'ad666666-6666-4666-8666-666666666666'::uuid) $$,
  'Transfer audit records demotion, promotion, actor, and both Owners'
);

select results_eq(
  $$ select role from public.profiles where id in (
       'ad111111-1111-4111-8111-111111111111', 'ad666666-6666-4666-8666-666666666666')
     order by id $$,
  array['admin'::text, 'owner'::text],
  'Ownership transfer applies the expected roles'
);

-- ============================================================
-- Immutability
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ad666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select count(*) from private.profile_role_change_audit $$,
  '42501', null,
  'Authenticated users (even the Owner) cannot select audit rows directly'
);
select throws_ok(
  $$ update private.profile_role_change_audit set new_role = 'staff' $$,
  '42501', null,
  'Authenticated users cannot update audit rows'
);
select throws_ok(
  $$ delete from private.profile_role_change_audit $$,
  '42501', null,
  'Authenticated users cannot delete audit rows'
);
select throws_ok(
  $$ insert into private.profile_role_change_audit (action, actor_profile_id, target_profile_id, previous_role, new_role)
     values ('role_assignment', 'ad666666-6666-4666-8666-666666666666', 'ad333333-3333-4333-8333-333333333333', 'staff', 'admin') $$,
  '42501', null,
  'Authenticated users cannot forge audit rows'
);
select throws_ok(
  $$ select private.apply_audited_profile_role('ad333333-3333-4333-8333-333333333333', 'admin', 'role_assignment') $$,
  '42501', null,
  'Authenticated users cannot call the audited role-change helper'
);

reset role;
set local role service_role;

select throws_ok(
  $$ delete from private.profile_role_change_audit $$,
  '42501', null,
  'Service role cannot delete audit rows'
);

reset role;

select throws_ok(
  $$ update private.profile_role_change_audit set new_role = new_role $$,
  'P0001', 'Role change audit records are append-only',
  'Even the table owner cannot update audit rows'
);
select throws_ok(
  $$ delete from private.profile_role_change_audit $$,
  'P0001', 'Role change audit records are append-only',
  'Even the table owner cannot delete audit rows'
);
select throws_ok(
  $$ truncate private.profile_role_change_audit $$,
  'P0001', 'Role change audit records are append-only',
  'Even the table owner cannot truncate audit rows'
);

-- ============================================================
-- Visibility: Admin/Owner via RPC only; no emails or names
-- ============================================================

set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select ok(
  (select count(*) >= 7 from public.list_profile_role_change_audit(200, 0)
   where target_profile_id in (select id from audit_fixture_ids)),
  'Admin can read role change audit through the RPC'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
select ok(
  (select count(*) = 2 from public.list_profile_role_change_audit(200, 0) where action = 'ownership_transfer'),
  'Owner can read ownership transfer audit through the RPC'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from public.list_profile_role_change_audit() $$,
  'P0001', 'Role change audit access required',
  'HR cannot read role change audit'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from public.list_profile_role_change_audit() $$,
  'P0001', 'Role change audit access required',
  'Accounts cannot read role change audit'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'ad333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from public.list_profile_role_change_audit() $$,
  'P0001', 'Role change audit access required',
  'Staff cannot read role change audit'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.list_profile_role_change_audit() $$,
  '42501', null,
  'Anonymous callers cannot execute the audit RPC'
);

reset role;

select ok(
  pg_get_function_result('public.list_profile_role_change_audit(integer,integer)'::regprocedure)
    !~* '(email|full_name|reason|token|password)',
  'Audit RPC exposes ids and roles only'
);

select * from finish();
rollback;
