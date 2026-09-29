begin;

select plan(2);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values ('e4444444-4444-4444-8444-444444444444', 'worker-signup-link@test.local', '{"full_name":"Worker Signup Link"}');

reset role;
select private.apply_profile_role('e4444444-4444-4444-8444-444444444444', 'staff');

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

create temp table worker_signup_fixture as
select public.ensure_signup_request_for_bulk_import(
  'worker-signup@test.local',
  'Worker Signup',
  null
) as request_id;

select is(
  (
    select g.status
    from public.get_signup_request((select request_id from worker_signup_fixture))
    g
    limit 1
  ),
  'approved',
  'bulk import worker can read signup requests as service_role'
);

select lives_ok(
  $$ select public.link_signup_request_profile(
    public.ensure_signup_request_for_bulk_import(
      'worker-signup-link@test.local',
      'Worker Signup Link',
      null
    ),
    'e4444444-4444-4444-8444-444444444444',
    null
  ) $$,
  'bulk import worker can link signup requests to profiles as service_role'
);

select * from finish();

rollback;
