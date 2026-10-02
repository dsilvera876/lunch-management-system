begin;

select plan(21);

\ir support/isolate_existing_owner.inc

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c8111111-1111-4111-8111-111111111111', 'hr-notify-one@test.local', '{"full_name":"HR Notify One"}'),
  ('c8222222-2222-4222-8222-222222222222', 'hr-notify-two@test.local', '{"full_name":"HR Notify Two"}'),
  ('c8333333-3333-4333-8333-333333333333', 'hr-notify-inactive@test.local', '{"full_name":"HR Inactive"}'),
  ('c8444444-4444-4444-8444-444444444444', 'hr-notify-admin@test.local', '{"full_name":"HR Notify Admin"}'),
  ('c8555555-5555-4555-8555-555555555555', 'hr-notify-settings@test.local', '{"full_name":"HR Settings"}');

reset role;
select private.apply_profile_role('c8111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('c8222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('c8333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('c8444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('c8555555-5555-4555-8555-555555555555', 'admin');

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'c8333333-3333-4333-8333-333333333333';
select private.deactivate_trusted_account_status_change();

set local role anon;

select is(
  (public.request_external_signup('Notify Applicant', 'notify-applicant@gmail.com') ->> 'code'),
  'submitted',
  'A: external signup request becomes pending'
);

reset role;

select ok(
  exists (
    select 1
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.profile_id = 'c8111111-1111-4111-8111-111111111111'
      and d.status = 'pending'
  ),
  'A: active HR recipient gets pending notification delivery intent'
);

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.profile_id in (
        'c8111111-1111-4111-8111-111111111111',
        'c8222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'B: two active HR users each get one delivery row'
);

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.profile_id = 'c8333333-3333-4333-8333-333333333333'
  ),
  0,
  'C: inactive HR does not receive delivery intent'
);

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.profile_id = 'c8444444-4444-4444-8444-444444444444'
  ),
  0,
  'D: Admin profile does not receive HR operational signup notification'
);

select is(
  (public.request_external_signup('Company Person', 'newco@example.test') ->> 'code'),
  'company_email',
  'E: company-domain signup does not use external request path'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.signup_request_id is null
  ),
  0,
  'E: company-domain attempt does not create orphan HR notification rows'
);

set local role anon;

select is(
  (public.request_external_signup('Notify Applicant', 'notify-applicant@gmail.com') ->> 'code'),
  'already_pending',
  'F: duplicate pending signup returns already_pending'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.profile_id = 'c8111111-1111-4111-8111-111111111111'
  ),
  1,
  'F: duplicate external signup does not duplicate HR delivery intent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('hr.pending_signup_approval', false, null, null);
reset role;

set local role anon;

select is(
  (public.request_external_signup('Global Off Applicant', 'global-off@gmail.com') ->> 'code'),
  'submitted',
  'G: signup request still succeeds when global notification is OFF'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and exists (
        select 1
        from private.signup_requests sr
        where sr.id = d.signup_request_id
          and sr.normalized_email = 'global-off@gmail.com'
      )
  ),
  0,
  'G: global OFF produces no delivery intent for new pending request'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('hr.pending_signup_approval', true, null, null);
reset role;

do $$
declare
  v_request_id uuid;
begin
  select sr.id
  into v_request_id
  from private.signup_requests sr
  where sr.normalized_email = 'notify-applicant@gmail.com'
    and sr.status = 'pending'
  limit 1;

  perform private.notify_hr_pending_signup_approval(v_request_id);
  perform private.notify_hr_pending_signup_approval(v_request_id);
  perform set_config('test.hr_signup_request_id', v_request_id::text, false);
end;
$$;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and d.signup_request_id = current_setting('test.hr_signup_request_id')::uuid
      and d.profile_id = 'c8222222-2222-4222-8222-222222222222'
  ),
  1,
  'H: idempotent notify retries do not duplicate recipient deliveries'
);

select throws_ok(
  $$
    select private.assert_notification_template_variables(
      'hr.pending_signup_approval',
      'Bad {{internal_id}}',
      '<p></p>',
      null
    )
  $$,
  'Unsupported template variables: internal_id',
  'Unsupported template variables are rejected'
);

reset role;

do $$
declare
  v_delivery_id uuid;
begin
  select d.id
  into v_delivery_id
  from private.notification_delivery_log d
  where d.event_key = 'hr.pending_signup_approval'
    and d.profile_id = 'c8111111-1111-4111-8111-111111111111'
    and d.status = 'pending'
  order by d.created_at
  limit 1;

  perform set_config('test.hr_signup_delivery_id', v_delivery_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select public.worker_queue_notification_delivery(
      current_setting('test.hr_signup_delivery_id')::uuid,
      'hr-notify-one@test.local',
      'New signup approval request',
      'Text snapshot',
      '<p>Html snapshot</p>'
    )
  $$,
  'J: worker queue retains rendered snapshots'
);

reset role;

select ok(
  (
    select rendered_subject
    from private.notification_delivery_log d
    where d.id = current_setting('test.hr_signup_delivery_id')::uuid
  ) = 'New signup approval request',
  'J: rendered subject snapshot stored on delivery log'
);

reset role;

select is(
  (
    select q.message_type
    from private.email_delivery_queue q
    inner join private.notification_delivery_log d on d.email_queue_id = q.id
    where d.id = current_setting('test.hr_signup_delivery_id')::uuid
  ),
  'notification_hr_pending_signup',
  'queued HR signup email uses notification_hr_pending_signup message type'
);

select is(
  (
    select q.correlation_type
    from private.email_delivery_queue q
    inner join private.notification_delivery_log d on d.email_queue_id = q.id
    where d.id = current_setting('test.hr_signup_delivery_id')::uuid
  ),
  'notification_delivery',
  'queued HR signup email correlates to notification delivery row'
);

reset role;

update private.email_delivery_queue q
set status = 'sent', sent_at = now()
from private.notification_delivery_log d
where d.email_queue_id = q.id
  and d.id = current_setting('test.hr_signup_delivery_id')::uuid;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select public.service_enqueue_email_delivery(
  'notification_hr_pending_signup',
  'hr-notify-two@test.local',
  'Claim path probe',
  'text',
  '<p>html</p>',
  'notification_delivery',
  gen_random_uuid(),
  false
);

select ok(
  (
    select count(*)::integer
    from public.worker_claim_email_delivery_queue(10)
    where message_type = 'notification_hr_pending_signup'
  ) >= 1,
  'worker_claim_email_delivery_queue claims notification_hr_pending_signup rows'
);

reset role;

select ok(
  public.worker_should_deliver_email_queue_message(
    (
      select id
      from private.email_delivery_queue
      where recipient_email = 'hr-notify-two@test.local'
      order by created_at desc
      limit 1
    )
  ),
  'worker_should_deliver accepts HR pending signup queue message'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select ok(
  (
    select total_count from public.get_notification_delivery_dashboard(current_date - 1, current_date + 1)
  ) >= 1,
  'K: HR pending signup notifications appear in Email Delivery dashboard counts'
);

select ok(
  exists (
    select 1
    from public.list_notification_delivery_batches(
      current_date - 1,
      current_date + 1,
      'hr.pending_signup_approval',
      null,
      50,
      0
    )
  ),
  'K: delivery batch history lists pending signup approval event'
);

select * from finish();
rollback;
