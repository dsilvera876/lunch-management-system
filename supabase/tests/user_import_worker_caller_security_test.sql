begin;

select plan(27);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f1111111-1111-4111-8111-111111111111', 'wsec-staff@test.local', '{"full_name":"Worker Sec Staff"}'),
  ('f1222222-2222-4222-8222-222222222222', 'wsec-hr@test.local', '{"full_name":"Worker Sec HR"}'),
  ('f1333333-3333-4333-8333-333333333333', 'wsec-accounts@test.local', '{"full_name":"Worker Sec Accounts"}'),
  ('f1444444-4444-4444-8444-444444444444', 'wsec-admin@test.local', '{"full_name":"Worker Sec Admin"}'),
  ('f1555555-5555-4555-8555-555555555555', 'wsec-owner@test.local', '{"full_name":"Worker Sec Owner"}'),
  ('f1666666-6666-4666-8666-666666666666', 'wsec-promote@test.local', '{"full_name":"Worker Sec Promote"}');

reset role;
select private.apply_profile_role('f1111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('f1222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('f1333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('f1444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('f1555555-5555-4555-8555-555555555555', 'owner');
select private.apply_profile_role('f1666666-6666-4666-8666-666666666666', 'staff');

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select set_config(
  'test.wsec_signup_request_id',
  public.ensure_signup_request_for_bulk_import(
    'wsec-worker-signup@test.local',
    'Worker Sec Signup',
    null
  )::text,
  true
);

reset role;

insert into private.user_import_batches (
  id,
  created_by,
  status,
  total_rows,
  confirmed_at
)
values (
  'f2111111-1111-4111-8111-111111111111',
  'f1222222-2222-4222-8222-222222222222',
  'processing',
  1,
  now()
);

insert into private.user_import_rows (
  id,
  batch_id,
  row_number,
  full_name,
  email,
  normalized_email,
  classification,
  preview_message,
  action_code,
  status,
  profile_id
)
values (
  'f2211111-1111-4111-8111-111111111111',
  'f2111111-1111-4111-8111-111111111111',
  1,
  'Worker Sec Staff',
  'wsec-staff@test.local',
  'wsec-staff@test.local',
  'existing_active',
  'update',
  'update_profile',
  'processing',
  'f1111111-1111-4111-8111-111111111111'
);

-- ============================================================
-- private.is_worker_service_caller() — application JWT contexts
-- (superuser can execute; authenticated cannot call directly)
-- ============================================================

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'Staff authenticated JWT is not worker service caller'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'HR authenticated JWT is not worker service caller'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'Accounts authenticated JWT is not worker service caller'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'Admin authenticated JWT is not worker service caller'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'Owner authenticated JWT is not worker service caller'
);

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (select private.is_worker_service_caller()),
  'Effective service_role API role is worker service caller'
);

-- Profile role elevation does not affect worker caller (uses JWT API role only).

select private.apply_profile_role('f1666666-6666-4666-8666-666666666666', 'admin');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'Promoting profile to Admin does not make is_worker_service_caller true'
);

\ir support/isolate_existing_owner.inc

select private.apply_profile_role('f1666666-6666-4666-8666-666666666666', 'owner');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text,
  true
);

select ok(
  not (select private.is_worker_service_caller()),
  'Promoting profile to Owner does not make is_worker_service_caller true'
);

-- Spoof: authenticated JWT role must win over request.jwt.claim.role GUC.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  not (select private.is_worker_service_caller()),
  'request.jwt.claim.role alone cannot spoof worker when JWT role is authenticated'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (select private.is_worker_service_caller()) is distinct from true,
  'Partial JWT with sub only cannot spoof worker via request.jwt.claim.role'
);

set local role authenticated;

select throws_ok(
  $$
    select g.status
    from public.get_signup_request(current_setting('test.wsec_signup_request_id')::uuid) g
    limit 1
  $$,
  'P0001',
  'Signup request management access required',
  'Authenticated Staff cannot use claim.role fallback to bypass signup RPC auth'
);

-- ============================================================
-- Worker-only RPC: service_apply_user_import_profile_update
-- ============================================================

set local role anon;

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'Anon denied worker profile update RPC'
);

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'Staff denied worker profile update RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'HR denied worker profile update RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'Accounts denied worker profile update RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'Admin denied worker profile update RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'Owner denied worker profile update RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff',
      null
    )
  $$,
  'permission denied for function service_apply_user_import_profile_update',
  'Authenticated session cannot invoke worker RPC via claim.role GUC alone'
);

-- ============================================================
-- Signup orchestration RPCs (worker bypass vs HR app permission)
-- ============================================================

set local role anon;

select throws_ok(
  $$
    select count(*) from public.get_signup_request(
      current_setting('test.wsec_signup_request_id')::uuid
    )
  $$,
  'permission denied for function get_signup_request',
  'Anon denied get_signup_request'
);

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select count(*) from public.get_signup_request(
      current_setting('test.wsec_signup_request_id')::uuid
    )
  $$,
  'P0001',
  'Signup request management access required',
  'Staff denied get_signup_request without HR permission'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select g.status
    from public.get_signup_request(current_setting('test.wsec_signup_request_id')::uuid) g
    limit 1
  ),
  'approved',
  'HR may read signup request via can_manage_signup_requests (not worker bypass)'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select count(*) from public.get_signup_request(
      current_setting('test.wsec_signup_request_id')::uuid
    )
  $$,
  'P0001',
  'Signup request management access required',
  'Accounts denied get_signup_request'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select count(*) from public.get_signup_request(
      current_setting('test.wsec_signup_request_id')::uuid
    )
  $$,
  'P0001',
  'Signup request management access required',
  'Admin denied get_signup_request'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select count(*) from public.get_signup_request(
      current_setting('test.wsec_signup_request_id')::uuid
    )
  $$,
  'P0001',
  'Signup request management access required',
  'Owner denied get_signup_request'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$
    select count(*) from public.get_signup_request(
      current_setting('test.wsec_signup_request_id')::uuid
    )
  $$,
  'P0001',
  'Signup request management access required',
  'Staff with claim.role spoof still denied get_signup_request worker bypass'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select g.status
    from public.get_signup_request(current_setting('test.wsec_signup_request_id')::uuid) g
    limit 1
  ),
  'approved',
  'service_role allowed get_signup_request via worker service caller'
);

select lives_ok(
  $$
    select public.service_apply_user_import_profile_update(
      'f2211111-1111-4111-8111-111111111111',
      'Worker Sec Staff Updated',
      null
    )
  $$,
  'service_role allowed service_apply_user_import_profile_update'
);

select * from finish();

rollback;
