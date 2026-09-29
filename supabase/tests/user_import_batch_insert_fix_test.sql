begin;

select plan(2);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values ('c1111111-1111-4111-8111-111111111111', 'import-fix-hr@test.local', '{"full_name":"Import Fix HR"}');

reset role;
select private.apply_profile_role('c1111111-1111-4111-8111-111111111111', 'hr');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_user_import_batch(
    '[{"row_number":2,"full_name":"Short ID","email":"short-id-fix@example.test","employee_id":"54"}]'::jsonb
  ) $$,
  'short Employee ID rows still create a preview batch without insert failure'
);

select is(
  (
    select e ->> 'employee_id'
    from jsonb_array_elements(
      (public.get_user_import_batch(
        (public.create_user_import_batch(
          '[{"row_number":2,"full_name":"Short ID","email":"short-id-fix2@example.test","employee_id":"54"}]'::jsonb
        ) ->> 'batch_id')::uuid
      ) -> 'rows')
    ) e
    limit 1
  ),
  '0054',
  'Excel-style short Employee ID is stored as 0054'
);

select * from finish();

rollback;
