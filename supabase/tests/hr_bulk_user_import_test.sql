begin;

select plan(27);

\ir support/isolate_existing_owner.inc

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b1111111-1111-4111-8111-111111111111', 'import-hr@test.local', '{"full_name":"Import HR"}'),
  ('b2222222-2222-4222-8222-222222222222', 'import-adm@test.local', '{"full_name":"Import Admin"}'),
  ('b3333333-3333-4333-8333-333333333333', 'import-acc@test.local', '{"full_name":"Import Accounts"}'),
  ('b4444444-4444-4444-8444-444444444444', 'import-staff@test.local', '{"full_name":"Import Staff"}'),
  ('b5555555-5555-4555-8555-555555555555', 'import-owner@test.local', '{"full_name":"Import Owner"}'),
  ('b6666666-6666-4666-8666-666666666666', 'inactive-import@test.local', '{"full_name":"Inactive Import"}');

reset role;
select private.apply_profile_role('b1111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('b2222222-2222-4222-8222-222222222222', 'admin');
select private.apply_profile_role('b3333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('b5555555-5555-4555-8555-555555555555', 'owner');

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'b6666666-6666-4666-8666-666666666666';
select private.deactivate_trusted_account_status_change();

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.set_employee_id('b4444444-4444-4444-8444-444444444444', '0054');

-- ============================================================
-- Authorization
-- ============================================================

select ok(
  (select private.can_manage_user_import()),
  'HR can manage bulk user import'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.validate_user_import_rows('[{"row_number":1,"full_name":"X","email":"x@example.test","employee_id":null}]'::jsonb) $$,
  'P0001',
  'Bulk user import access required',
  'Admin cannot validate bulk import'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.validate_user_import_rows('[{"row_number":1,"full_name":"X","email":"x@example.test","employee_id":null}]'::jsonb) $$,
  'P0001',
  'Bulk user import access required',
  'Owner cannot validate bulk import'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.validate_user_import_rows('[{"row_number":1,"full_name":"X","email":"x@example.test","employee_id":null}]'::jsonb) $$,
  'P0001',
  'Bulk user import access required',
  'Accounts cannot validate bulk import'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.validate_user_import_rows('[{"row_number":1,"full_name":"X","email":"x@example.test","employee_id":null}]'::jsonb) $$,
  'P0001',
  'Bulk user import access required',
  'Staff cannot validate bulk import'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- ============================================================
-- Matching and classification
-- ============================================================

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":2,"full_name":"Import Staff","email":"Import-Staff@test.local","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_active',
  'normalized email matches existing active staff'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":3,"full_name":"Owner","email":"import-owner@test.local","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_privileged',
  'existing Owner preserved as privileged profile update'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":4,"full_name":"Admin","email":"import-adm@test.local","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_privileged',
  'existing Admin preserved as privileged profile update'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":5,"full_name":"Accounts","email":"import-acc@test.local","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_privileged',
  'existing Accounts preserved as privileged profile update'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":6,"full_name":"HR","email":"import-hr@test.local","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_privileged',
  'existing HR preserved as privileged profile update'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":7,"full_name":"Inactive","email":"inactive-import@test.local","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_inactive',
  'inactive users are classified for manual review'
);

-- ============================================================
-- Employee ID validation
-- ============================================================

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":8,"full_name":"Bad ID","email":"bad-id@example.test","employee_id":"54"}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'error',
  'malformed Employee ID is rejected'
);

select is(
  (
    select (public.validate_user_import_rows(
      '[{"row_number":9,"full_name":"Dup Email","email":"dup@example.test","employee_id":null},{"row_number":10,"full_name":"Dup Email 2","email":"DUP@example.test","employee_id":null}]'::jsonb
    ) -> 'summary' ->> 'blocking_errors')::boolean
  ),
  true,
  'duplicate normalized email in CSV blocks confirm'
);

select is(
  (
    select (public.validate_user_import_rows(
      '[{"row_number":11,"full_name":"Dup Emp","email":"de1@example.test","employee_id":"0099"},{"row_number":12,"full_name":"Dup Emp 2","email":"de2@example.test","employee_id":"0099"}]'::jsonb
    ) -> 'summary' ->> 'blocking_errors')::boolean
  ),
  true,
  'duplicate Employee ID in CSV blocks confirm'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":13,"full_name":"Conflict","email":"conflict@example.test","employee_id":"0054"}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'error',
  'Employee ID conflict with another user blocks import'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":14,"full_name":"Import Staff","email":"import-staff@test.local","employee_id":"0054"}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'existing_active',
  'same user may keep their current Employee ID'
);

-- ============================================================
-- Signup request states
-- ============================================================

reset role;
set local role anon;
select public.request_external_signup('Pending Person', 'pending-ext@gmail.com');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":15,"full_name":"Pending Person","email":"pending-ext@gmail.com","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'pending_signup',
  'pending external signup resumes on import'
);

reset role;
set local role anon;
select public.request_external_signup('Rejected Person', 'rejected-ext@gmail.com');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.reject_signup_request(
  (select request_id from public.search_signup_requests('rejected-ext@gmail.com', null, 5, 0) limit 1),
  'Not eligible'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":16,"full_name":"Rejected Person","email":"rejected-ext@gmail.com","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'previously_rejected',
  'rejected signup is classified for HR import authorization'
);

select lives_ok(
  $$ select public.authorize_rejected_signup_for_bulk_import(
    (select request_id from public.search_signup_requests('rejected-ext@gmail.com', null, 5, 0) limit 1),
    null
  ) $$,
  'HR can authorize previously rejected signup for bulk import'
);

reset role;

select isnt(
  (
    select sr.prior_rejection_reason
    from private.signup_requests sr
    where sr.email = 'rejected-ext@gmail.com'
    limit 1
  ),
  null,
  'prior rejection reason retained after bulk import authorization'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- ============================================================
-- Batch lifecycle (preview only until confirm)
-- ============================================================

select ok(
  length(coalesce(public.create_user_import_batch(
    '[{"row_number":17,"full_name":"Launch Hire","email":"launch-hire@example.test","employee_id":"1123"}]'::jsonb
  ) ->> 'batch_id', '')) > 0,
  'create import batch stores draft rows'
);

select is(
  (
    select public.validate_user_import_rows(
      '[{"row_number":18,"full_name":"New Co","email":"newco@example.test","employee_id":"1234"}]'::jsonb
    ) ->> 'can_confirm'
  ),
  'true',
  'valid launch row allows confirm'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":19,"full_name":"New Co","email":"newco2@example.test","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'new_company',
  'company-domain import row classified as new user'
);

select is(
  (
    select e ->> 'classification'
    from jsonb_array_elements(
      (public.validate_user_import_rows(
        '[{"row_number":20,"full_name":"External","email":"external@gmail.com","employee_id":null}]'::jsonb
      ) -> 'rows')
    ) e
    limit 1
  ),
  'new_external',
  'external email classified for HR-approved onboarding'
);

select is(
  (
    select public.confirm_user_import_batch(
      (public.create_user_import_batch(
        '[{"row_number":21,"full_name":"Confirm Hire","email":"confirm-hire@example.test","employee_id":"1234"}]'::jsonb
      ) ->> 'batch_id')::uuid
    ) ->> 'ok'
  ),
  'true',
  'confirm moves draft batch to queued processing'
);

select is(
  (
    select public.get_user_import_batch(
      (public.create_user_import_batch(
        '[{"row_number":22,"full_name":"Draft Hire","email":"draft-hire@example.test","employee_id":null}]'::jsonb
      ) ->> 'batch_id')::uuid
    ) ->> 'status'
  ),
  'draft',
  'HR can read draft import batch status'
);

select public.confirm_user_import_batch(
  (public.create_user_import_batch(
    '[{"row_number":30,"full_name":"Worker Hire","email":"worker-import@example.test","employee_id":null}]'::jsonb
  ) ->> 'batch_id')::uuid
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$ select count(*)::bigint from public.worker_claim_user_import_rows(1) $$,
  array[1::bigint],
  'worker can claim queued import row'
);

select * from finish();

rollback;
