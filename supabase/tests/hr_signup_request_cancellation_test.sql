begin;

select plan(37);

\ir support/isolate_existing_owner.inc

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c1111111-1111-4111-8111-111111111111', 'cancel-hr@test.local', '{"full_name":"Cancel HR"}'),
  ('c1222222-2222-4222-8222-222222222222', 'cancel-adm@test.local', '{"full_name":"Cancel Admin"}'),
  ('c1333333-3333-4333-8333-333333333333', 'cancel-staff@test.local', '{"full_name":"Cancel Staff"}'),
  ('c1444444-4444-4444-8444-444444444444', 'cancel-acc@test.local', '{"full_name":"Cancel Accounts"}'),
  ('c1555555-5555-4555-8555-555555555555', 'cancel-owner@test.local', '{"full_name":"Cancel Owner"}');

reset role;
select private.apply_profile_role('c1111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('c1222222-2222-4222-8222-222222222222', 'admin');
select private.apply_profile_role('c1333333-3333-4333-8333-333333333333', 'staff');
select private.apply_profile_role('c1444444-4444-4444-8444-444444444444', 'accounts');
select private.apply_profile_role('c1555555-5555-4555-8555-555555555555', 'owner');

set local role anon;
select public.request_external_signup('Pending Cancel', 'pending-cancel@gmail.com');
select public.request_external_signup('Approved Incomplete', 'approved-incomplete@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'approved-incomplete@gmail.com' limit 1),
  null
);

select is(
  (
    select success::text
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
       where email = 'pending-cancel@gmail.com' limit 1),
      'incorrect_email',
      'Wrong address'
    )
  ),
  'true',
  'HR can cancel pending signup request'
);

select is(
  (
    select status
    from public.search_signup_requests(null, 'cancelled', 50, 0)
    where email = 'pending-cancel@gmail.com'
    limit 1
  ),
  'cancelled',
  'pending cancellation sets status cancelled'
);

select is(
  (
    select cancellation_reason
    from public.search_signup_requests(null, 'cancelled', 50, 0)
    where email = 'pending-cancel@gmail.com'
    limit 1
  ),
  'incorrect_email',
  'cancellation reason recorded'
);

select is(
  (
    select success::text
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
       where email = 'approved-incomplete@gmail.com' limit 1),
      'no_longer_needed',
      null
    )
  ),
  'true',
  'HR can cancel approved-incomplete signup request'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

set local role anon;
select public.request_external_signup('Reject Only', 'reject-only@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.reject_signup_request(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'reject-only@gmail.com' limit 1),
  'typo'
);

select is(
  (
    select success::text
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'rejected', 50, 0)
       where email = 'reject-only@gmail.com' limit 1),
      'other',
      null
    )
  ),
  'false',
  'rejected signup request cannot be cancelled'
);

set local role anon;
select public.request_external_signup('Linked User', 'linked-user@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

reset role;
update private.signup_requests sr
set created_profile_id = 'c1333333-3333-4333-8333-333333333333'
where sr.normalized_email = 'linked-user@gmail.com';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select success::text
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
       where email = 'linked-user@gmail.com' limit 1),
      'other',
      null
    )
  ),
  'false',
  'profile-linked signup request cannot be cancelled'
);

set local role anon;
select public.request_external_signup('Already Cancelled', 'already-cancelled@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.cancel_signup_request(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'already-cancelled@gmail.com' limit 1),
  'duplicate_request',
  null
);

select is(
  (
    select success::text
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'cancelled', 50, 0)
       where email = 'already-cancelled@gmail.com' limit 1),
      'duplicate_request',
      null
    )
  ),
  'true',
  'already-cancelled request is idempotent'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select success from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'cancelled', 50, 0) limit 1),
      'other',
      null
    )
  $$,
  'P0001',
  'Signup request management access required',
  'Staff denied cancel signup request'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select success from public.cancel_signup_request(gen_random_uuid(), 'other', null) $$,
  'P0001',
  'Signup request management access required',
  'Admin denied cancel signup request'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select success from public.cancel_signup_request(gen_random_uuid(), 'other', null) $$,
  'P0001',
  'Signup request management access required',
  'Accounts denied cancel signup request'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select success from public.cancel_signup_request(gen_random_uuid(), 'other', null) $$,
  'P0001',
  'Signup request management access required',
  'Owner denied cancel signup request'
);

-- Email queue cleanup + worker refusal
set local role anon;
select public.request_external_signup('Queue Cancel', 'queue-cancel@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'queue-cancel@gmail.com' limit 1),
  null
);

reset role;
select set_config(
  'test.queue_cancel_request_id',
  (
    select sr.id::text
    from private.signup_requests sr
    where sr.normalized_email = 'queue-cancel@gmail.com'
    limit 1
  ),
  true
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select public.service_enqueue_email_delivery(
  'account_setup_invite',
  'queue-cancel@gmail.com',
  'Setup',
  'body',
  '<p>body</p>',
  'signup_request',
  current_setting('test.queue_cancel_request_id')::uuid,
  false
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.cancel_signup_request(
  (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
   where email = 'queue-cancel@gmail.com' limit 1),
  'incorrect_email',
  null
);

reset role;

select is(
  (
    select q.status
    from private.email_delivery_queue q
    where q.correlation_type = 'signup_request'
      and q.correlation_id = (
        select sr.id
        from private.signup_requests sr
        where sr.normalized_email = 'queue-cancel@gmail.com'
        limit 1
      )
    order by q.created_at desc
    limit 1
  ),
  'failed',
  'queued invite marked failed on cancel'
);

select ok(
  not public.worker_should_deliver_email_queue_message(
    (
      select q.id
      from private.email_delivery_queue q
      where q.correlation_type = 'signup_request'
        and q.correlation_id = (
          select sr.id
          from private.signup_requests sr
          where sr.normalized_email = 'queue-cancel@gmail.com'
          limit 1
        )
      order by q.created_at desc
      limit 1
    )
  ),
  'worker refuses delivery for cancelled signup request'
);

-- Email reuse after cancellation
set local role anon;

select is(
  (public.request_external_signup('Fresh After Cancel', 'pending-cancel@gmail.com') ->> 'code'),
  'submitted',
  'cancelled email can submit fresh external request'
);

reset role;
select set_config(
  'test.cancelled_approved_incomplete_id',
  (
    select sr.id::text
    from private.signup_requests sr
    where sr.normalized_email = 'approved-incomplete@gmail.com'
      and sr.status = 'cancelled'
    limit 1
  ),
  true
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  public.ensure_signup_request_for_bulk_import(
    'approved-incomplete@gmail.com',
    'Bulk After Cancel',
    null
  )::text <> current_setting('test.cancelled_approved_incomplete_id'),
  'bulk import creates new signup request after cancellation'
);

reset role;

select ok(
  (
    select count(*)::int
    from private.signup_requests sr
    where sr.normalized_email = 'approved-incomplete@gmail.com'
  ) >= 2,
  'historical cancelled signup row preserved'
);

-- Approved-incomplete invite state: auth.users exists before signup link completes
set local role anon;
select public.request_external_signup('Auth Invite', 'auth-invite@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'auth-invite@gmail.com' limit 1),
  null
);

reset role;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'c1666666-6666-4666-8666-666666666666',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'auth-invite@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Auth Invite"}'::jsonb,
  now(),
  now(),
  false,
  false
);

select set_config(
  'test.auth_invite_request_id',
  (
    select request_id::text
    from public.search_signup_requests(null, 'approved', 50, 0)
    where email = 'auth-invite@gmail.com'
    limit 1
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select outcome_code
    from public.cancel_signup_request(
      current_setting('test.auth_invite_request_id')::uuid,
      'incorrect_email',
      null
    )
  ),
  'auth_cleanup_required',
  'approved incomplete with auth identity enters auth cleanup path'
);

select is(
  (
    select status
    from public.search_signup_requests(null, 'approved', 50, 0)
    where email = 'auth-invite@gmail.com'
    limit 1
  ),
  'approved',
  'signup request stays approved until auth cleanup completes'
);

reset role;

select ok(
  not exists (
    select 1
    from public.profiles p
    where p.id = 'c1666666-6666-4666-8666-666666666666'
  ),
  'auth cleanup removes onboarding profile while auth identity remains'
);

select ok(
  exists (
    select 1
    from private.user_account_deletion_audit uada
    where uada.deleted_profile_id = 'c1666666-6666-4666-8666-666666666666'
      and uada.auth_delete_status = 'pending'
  ),
  'auth deletion audit pending during cancellation window'
);

select ok(
  private.signup_email_has_application_account('auth-invite@gmail.com'),
  'auth identity still present while signup cancellation auth cleanup is pending'
);

-- Invitee may establish an Auth session (invite OTP) but must not gain application access.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text,
  true
);

select is(
  (select private.current_user_id()),
  null,
  'auth session without active profile is not an application user'
);

select throws_ok(
  format(
    $$ select public.submit_order(%L::uuid, '[]'::jsonb) $$,
    (select id from public.lunch_days limit 1)
  ),
  'Authentication required',
  'profile-less invitee cannot submit orders during auth cleanup pending'
);

select throws_ok(
  $$ select public.link_signup_request_profile(
      current_setting('test.auth_invite_request_id')::uuid,
      'c1666666-6666-4666-8666-666666666666',
      null
    ) $$,
  'Authentication required',
  'profile-less invitee cannot link signup request during auth cleanup pending'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select outcome_code
    from public.complete_signup_request_cancellation(
      current_setting('test.auth_invite_request_id')::uuid,
      'incorrect_email',
      null,
      'c1666666-6666-4666-8666-666666666666'::uuid
    )
  ),
  'auth_cleanup_incomplete',
  'complete cancellation refuses while auth identity still exists'
);

reset role;
delete from auth.users where id = 'c1666666-6666-4666-8666-666666666666';

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select success::text
    from public.complete_signup_request_cancellation(
      current_setting('test.auth_invite_request_id')::uuid,
      'incorrect_email',
      null,
      'c1666666-6666-4666-8666-666666666666'::uuid
    )
  ),
  'true',
  'complete cancellation succeeds after auth identity removed'
);

reset role;

select is(
  (
    select sr.status
    from private.signup_requests sr
    where sr.normalized_email = 'auth-invite@gmail.com'
    limit 1
  ),
  'cancelled',
  'signup request finalized cancelled after auth cleanup'
);

select ok(
  not exists (
    select 1
    from auth.users au
    where private.normalize_signup_email(au.email::text) = 'auth-invite@gmail.com'
  ),
  'auth identity removed for cancelled invite onboarding'
);

reset role;

select is(
  (public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'auth-invite@gmail.com'))) -> 'error' ->> 'message'),
  'Signup is not permitted for this email address.',
  'stale invite cannot restore onboarding after cancellation without a new approval'
);

set local role anon;

select is(
  (public.request_external_signup('Auth Invite Retry', 'auth-invite@gmail.com') ->> 'code'),
  'submitted',
  'email reusable after successful auth cleanup cancellation'
);

-- Business history blocks cancellation for onboarding profile stub
reset role;

set local role anon;
select public.request_external_signup('History Block', 'history-block@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'history-block@gmail.com' limit 1),
  null
);

reset role;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'c1777777-7777-4777-8777-777777777777',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'history-block@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"History Block"}'::jsonb,
  now(),
  now(),
  false,
  false
);

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email)
values (
  'c1999999-9999-4999-8999-999999999998',
  'History Block Kitchen',
  true,
  'provider-order+fixture@example.test'
);

insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'c1999999-9999-4999-8999-999999999999',
  public.delivery_date_for_order_date('2099-06-10'::date),
  '2099-06-10'::date,
  'c1999999-9999-4999-8999-999999999998',
  public.order_deadline_for_order_date('2099-06-10'::date),
  'open'
);

insert into public.orders (id, profile_id, lunch_day_id, status)
values (
  'c1888888-8888-4888-8888-888888888888',
  'c1777777-7777-4777-8777-777777777777',
  'c1999999-9999-4999-8999-999999999999',
  'submitted'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select outcome_code
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
       where email = 'history-block@gmail.com' limit 1),
      'other',
      null
    )
  ),
  'business_history',
  'business-history onboarding profile cannot be cancelled from signup review'
);

-- Bulk-import style: approved, Auth + profile linked, invite never accepted
reset role;

set local role anon;
select public.request_external_signup('Bulk Linked', 'bulk-linked@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'bulk-linked@gmail.com' limit 1),
  null
);

reset role;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'c1999999-9999-4999-8999-999999999999',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'bulk-linked@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  null,
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Bulk Linked"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.link_signup_request_profile(
  (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
   where email = 'bulk-linked@gmail.com' limit 1),
  'c1999999-9999-4999-8999-999999999999',
  null
);

select is(
  (
    select onboarding_established
    from public.search_signup_requests('bulk-linked@gmail.com', 'approved', 10, 0)
    limit 1
  ),
  false,
  'search exposes onboarding_established=false for linked unused invite'
);

select set_config(
  'test.bulk_linked_request_id',
  (
    select request_id::text
    from public.search_signup_requests(null, 'approved', 50, 0)
    where email = 'bulk-linked@gmail.com'
    limit 1
  ),
  true
);

select is(
  (
    select outcome_code
    from public.cancel_signup_request(
      current_setting('test.bulk_linked_request_id')::uuid,
      'no_longer_needed',
      null
    )
  ),
  'auth_cleanup_required',
  'HR can cancel approved signup with linked profile before invite acceptance'
);

reset role;

select is(
  (
    select count(*)::int
    from private.user_account_deletion_audit uada
    where uada.deleted_profile_id = 'c1999999-9999-4999-8999-999999999999'
  ),
  1,
  'linked onboarding cancellation creates a single auth cleanup audit row'
);

delete from auth.users where id = 'c1999999-9999-4999-8999-999999999999';

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select success::text
    from public.complete_signup_request_cancellation(
      current_setting('test.bulk_linked_request_id')::uuid,
      'no_longer_needed',
      null,
      'c1999999-9999-4999-8999-999999999999'::uuid
    )
  ),
  'true',
  'bulk-linked cancellation finalizes after Auth deletion'
);

reset role;
set local role anon;

select is(
  (public.request_external_signup('Bulk Linked Retry', 'bulk-linked@gmail.com') ->> 'code'),
  'submitted',
  'bulk-linked email reusable after cancellation cleanup'
);

-- Completed onboarding blocks cancellation even when request stays approved
reset role;

set local role anon;
select public.request_external_signup('Bulk Complete', 'bulk-complete@gmail.com');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.mark_signup_request_approved(
  (select request_id from public.search_signup_requests(null, 'pending', 50, 0)
   where email = 'bulk-complete@gmail.com' limit 1),
  null
);

reset role;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'bulk-complete@gmail.com',
  extensions.crypt('LunchTest123!', extensions.gen_salt('bf')),
  null,
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Bulk Complete"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.link_signup_request_profile(
  (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
   where email = 'bulk-complete@gmail.com' limit 1),
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null
);

reset role;

update private.signup_requests sr
set onboarding_completed_at = now()
where sr.normalized_email = 'bulk-complete@gmail.com';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (
    select outcome_code
    from public.cancel_signup_request(
      (select request_id from public.search_signup_requests(null, 'approved', 50, 0)
       where email = 'bulk-complete@gmail.com' limit 1),
      'other',
      null
    )
  ),
  'completed',
  'cancellation denied after Auth onboarding is established'
);

select * from finish();

rollback;
