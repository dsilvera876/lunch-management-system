begin;

select plan(13);

\ir support/isolate_existing_owner.inc

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d2222222-2222-4222-8222-222222222222', 'import-norm-hr@test.local', '{"full_name":"Import Norm HR"}'),
  ('d3333333-3333-4333-8333-333333333333', 'import-norm-staff@test.local', '{"full_name":"Norm Staff"}');

reset role;
select private.apply_profile_role('d2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('d3333333-3333-4333-8333-333333333333', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.set_employee_id('d3333333-3333-4333-8333-333333333333', '0054');

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"New Blank","email":"blank-new@example.test","employee_id":""}]'::jsonb
  ) -> 'rows' -> 0 ->> 'classification'),
  'new_company',
  'new user with blank Employee ID is valid'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"New Spaces","email":"blank-ws@example.test","employee_id":"   "}]'::jsonb
  ) -> 'rows' -> 0 ->> 'classification'),
  'new_company',
  'new user with whitespace-only Employee ID is valid'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"Existing Blank","email":"import-norm-staff@test.local","employee_id":""}]'::jsonb
  ) -> 'rows' -> 0 ->> 'classification'),
  'existing_active',
  'existing user with blank Employee ID is valid'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"Existing Blank","email":"import-norm-staff@test.local","employee_id":""}]'::jsonb
  ) -> 'rows' -> 0 ->> 'employee_id'),
  null,
  'blank Employee ID normalizes to null in Step 2 preview for existing users'
);

reset role;

select is(
  (
    select sr.employee_id
    from private.staff_registry sr
    where sr.profile_id = 'd3333333-3333-4333-8333-333333333333'
  ),
  '0054',
  'existing Employee ID unchanged when import row leaves Employee ID blank'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"A","email":"dup-blank-a@example.test","employee_id":""},
      {"row_number":3,"full_name":"B","email":"dup-blank-b@example.test","employee_id":"   "}]'::jsonb
  ) ->> 'can_confirm'),
  'true',
  'blank Employee IDs do not participate in duplicate-ID detection'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"A","email":"norm-a@example.test","employee_id":"99"}]'::jsonb
  ) -> 'rows' -> 0 ->> 'employee_id'),
  '0099',
  'validate preview exposes normalized Employee ID for short numeric input'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"A","email":"norm-b@example.test","employee_id":" 7 "}]'::jsonb
  ) -> 'rows' -> 0 ->> 'employee_id'),
  '0007',
  'validate trims whitespace before normalization'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"A","email":"dup-a@example.test","employee_id":"77"},
      {"row_number":3,"full_name":"B","email":"dup-b@example.test","employee_id":"0077"}]'::jsonb
  ) ->> 'can_confirm'),
  'false',
  '77 and 0077 in the same CSV are duplicate Employee IDs'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"Bad","email":"bad-emp@example.test","employee_id":"12345"}]'::jsonb
  ) -> 'rows' -> 0 ->> 'classification'),
  'error',
  'more than four digits is rejected'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"Bad","email":"bad-alpha@example.test","employee_id":"12A4"}]'::jsonb
  ) -> 'rows' -> 0 ->> 'classification'),
  'error',
  'non-digit Employee ID characters are rejected'
);

select is(
  (
    select e ->> 'employee_id'
    from jsonb_array_elements(
      (public.get_user_import_batch(
        (public.create_user_import_batch(
          '[{"row_number":2,"full_name":"Stored","email":"stored-norm@example.test","employee_id":"534"}]'::jsonb
        ) ->> 'batch_id')::uuid
      ) -> 'rows')
    ) e
    limit 1
  ),
  '0534',
  'batch insert persists canonical four-digit Employee ID'
);

select is(
  (public.validate_user_import_rows(
    '[{"row_number":2,"full_name":"New","email":"conflict-norm@example.test","employee_id":"54"}]'::jsonb
  ) -> 'rows' -> 0 ->> 'preview_message'),
  'Employee ID 0054 is already assigned to another user.',
  'registry conflict uses normalized Employee ID from CSV short form'
);

select * from finish();

rollback;
