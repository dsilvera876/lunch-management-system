begin;

select plan(11);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'b1111111-1111-4111-8111-111111111111',
  'Suppress Provider',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  'suppress-kitchen@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true,
  primary_order_email = excluded.primary_order_email;

\ir support/open_ordering.inc
\ir support/late_order_cycle.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('fa111111-1111-4111-8111-111111111111', 'suppress-hr@test.local', '{"full_name":"Suppress HR"}'),
  ('fa222222-2222-4222-8222-222222222222', 'suppress-admin@test.local', '{"full_name":"Suppress Admin"}');

reset role;
select private.apply_profile_role('fa111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('fa222222-2222-4222-8222-222222222222', 'admin');

reset role;

do $$
declare
  v_request_id uuid := 'fa333333-3333-4333-8333-333333333333';
  v_delivery_id uuid := 'fa444444-4444-4444-8444-444444444444';
  v_queue_id uuid := 'fa555555-5555-4555-8555-555555555555';
begin
  insert into private.staff_late_order_requests (
    id, requester_profile_id, provider_id, office_location_id, order_date,
    scheduled_delivery_date, status, requested_summary, quantity
  )
  values (
    v_request_id,
    'fa111111-1111-4111-8111-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    (select id from public.office_locations order by name limit 1),
    current_setting('test.late_order_date')::date,
    current_setting('test.late_delivery_date')::date,
    'pending',
    'Suppress alert test',
    1
  );

  insert into private.notification_delivery_log (
    id, event_key, profile_id, operational_date, status, idempotency_key, staff_late_order_request_id
  )
  values (
    v_delivery_id,
    'hr.late_order_submitted',
    'fa111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'queued',
    'hr.late_order_submitted:suppress-test:fa111111',
    v_request_id
  );

  insert into private.email_delivery_queue (
    id, message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at, correlation_type, correlation_id
  )
  values (
    v_queue_id,
    'notification_hr_late_order_submitted',
    'suppress-hr@test.local',
    'Late order request submitted',
    'text',
    '<p>html</p>',
    'processing',
    5,
    now(),
    'notification_delivery',
    v_delivery_id
  );

  update private.notification_delivery_log
  set email_queue_id = v_queue_id
  where id = v_delivery_id;

  perform set_config('test.suppress_request_id', v_request_id::text, false);
  perform set_config('test.suppress_delivery_id', v_delivery_id::text, false);
  perform set_config('test.suppress_queue_id', v_queue_id::text, false);
end;
$$;

select lives_ok(
  $$ select private.suppress_unsent_hr_late_order_submitted_deliveries(
    current_setting('test.suppress_request_id')::uuid
  ) $$,
  'Suppress HR submitted deliveries runs'
);

select is(
  (
    select status from private.notification_delivery_log
    where id = current_setting('test.suppress_delivery_id')::uuid
  ),
  'skipped',
  'Notification delivery ends skipped after suppression'
);

select ok(
  private.email_queue_last_error_is_superseded(
    (select last_error from private.email_delivery_queue where id = current_setting('test.suppress_queue_id')::uuid)
  ),
  'Queue row is marked as superseded, not a delivery failure'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'admin.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.suppress_queue_id')::uuid),
  0,
  'Superseded HR submitted queue does not enqueue admin failure alert'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'hr.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.suppress_queue_id')::uuid),
  0,
  'Superseded HR submitted queue does not enqueue HR failure alert'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  not public.worker_should_deliver_email_queue_message(
    current_setting('test.suppress_queue_id')::uuid
  ),
  'Mail worker refuses superseded queue rows'
);

select lives_ok(
  $$ select public.worker_complete_email_delivery(
    current_setting('test.suppress_queue_id')::uuid,
    'failed',
    'Should not be required'
  ) $$,
  'Completing a superseded queue row is a safe no-op'
);

reset role;

select lives_ok(
  $$ select private.notify_admin_email_delivery_queue_failure(
    current_setting('test.suppress_queue_id')::uuid
  ) $$,
  'Direct admin failure notify is a no-op for superseded queue'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'admin.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.suppress_queue_id')::uuid),
  0,
  'Direct admin failure notify still produces no alert for superseded queue'
);

-- Real SMTP terminal failure still alerts admin
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_hr_late_order_submitted', 'real-fail@example.test', 'S', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.real_fail_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(
    current_setting('test.real_fail_queue_id')::uuid,
    'failed',
    'SMTP connection refused'
  ) $$,
  'Terminal SMTP failure completes for HR submitted message type'
);

reset role;

select ok(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'admin.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.real_fail_queue_id')::uuid) >= 1,
  'Real terminal SMTP failure still produces admin failure alert'
);

select * from finish();
rollback;
