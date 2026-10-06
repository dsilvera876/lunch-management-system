begin;

select plan(26);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a0111111-1111-4111-8111-111111111111', 'alert-admin@test.local', '{"full_name":"Alert Admin"}'),
  ('a0222222-2222-4222-8222-222222222222', 'alert-owner@test.local', '{"full_name":"Alert Owner"}'),
  ('a0333333-3333-4333-8333-333333333333', 'alert-hr-one@test.local', '{"full_name":"Alert HR One"}'),
  ('a0444444-4444-4444-8444-444444444444', 'alert-hr-two@test.local', '{"full_name":"Alert HR Two"}'),
  ('a0555555-5555-4555-8555-555555555555', 'alert-hr-off@test.local', '{"full_name":"Alert HR Off"}');

reset role;
select private.apply_profile_role('a0111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('a0222222-2222-4222-8222-222222222222', 'owner');
select private.apply_profile_role('a0333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('a0444444-4444-4444-8444-444444444444', 'hr');
select private.apply_profile_role('a0555555-5555-4555-8555-555555555555', 'hr');

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'a0555555-5555-4555-8555-555555555555';
select private.deactivate_trusted_account_status_change();

-- Terminal auth_hook: Admin only
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'auth_hook', 'auth-fail@example.test', 'S', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.auth_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.auth_queue_id')::uuid, 'failed', 'SMTP down') $$,
  'terminal auth_hook completes'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'admin.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.auth_queue_id')::uuid
     and d.profile_id in ('a0111111-1111-4111-8111-111111111111', 'a0222222-2222-4222-8222-222222222222')),
  2,
  'Admin alert for terminal auth_hook to admin and owner'
);

select set_config(
  'test.auth_admin_delivery_id',
  (
    select d.id::text
    from private.notification_delivery_log d
    where d.event_key = 'admin.email_delivery_failure'
      and d.failed_email_queue_id = current_setting('test.auth_queue_id')::uuid
      and d.profile_id = 'a0111111-1111-4111-8111-111111111111'
    limit 1
  ),
  false
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'hr.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.auth_queue_id')::uuid),
  0,
  'HR does not alert on auth_hook terminal failure'
);

-- Today's Menu: Admin + HR
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_today_menu', 'staff@example.test', 'Menu', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.menu_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.menu_queue_id')::uuid, 'failed', 'fail') $$,
  'terminal today menu completes'
);

reset role;

select ok(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.menu_queue_id')::uuid
     and d.event_key = 'admin.email_delivery_failure') >= 2,
  'Admin alert on today menu failure'
);

select ok(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.menu_queue_id')::uuid
     and d.event_key = 'hr.email_delivery_failure'
     and d.profile_id in ('a0333333-3333-4333-8333-333333333333', 'a0444444-4444-4444-8444-444444444444')) = 2,
  'HR alert on today menu failure for active HR only'
);

select is(
  private.email_queue_hr_failure_business_category(current_setting('test.menu_queue_id')::uuid),
  'today_menu',
  'today menu maps to HR business category'
);

-- Order submitted via correlation
reset role;

do $$
declare
  v_delivery uuid;
  v_queue uuid;
begin
  insert into private.notification_delivery_log (
    event_key, profile_id, operational_date, status, idempotency_key
  ) values (
    'staff.order_submitted',
    'a0333333-3333-4333-8333-333333333333',
    current_date,
    'queued',
    'test-order-submitted-failure-alert'
  ) returning id into v_delivery;

  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at, correlation_type, correlation_id
  ) values (
    'notification_staff_order', 'staff@example.test', 'Order', 't', '<p>h</p>',
    'failed', 5, now(), 'notification_delivery', v_delivery
  ) returning id into v_queue;

  perform set_config('test.order_queue_id', v_queue::text, false);
  perform private.safe_notify_terminal_email_delivery_failures(v_queue);
end;
$$;

select is(
  private.email_queue_hr_failure_business_category(current_setting('test.order_queue_id')::uuid),
  'order_submitted',
  'order submitted correlation maps to HR category'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.order_queue_id')::uuid
     and d.event_key = 'hr.email_delivery_failure'
     and d.profile_id in ('a0333333-3333-4333-8333-333333333333', 'a0444444-4444-4444-8444-444444444444')),
  2,
  'HR alert on order submitted terminal failure'
);

-- Excluded staff events
do $$
declare v_delivery uuid; v_queue uuid;
begin
  insert into private.notification_delivery_log (
    event_key, profile_id, operational_date, status, idempotency_key
  ) values (
    'staff.deadline_reminder', 'a0333333-3333-4333-8333-333333333333', current_date, 'queued',
    'test-deadline-failure-alert'
  ) returning id into v_delivery;

  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at, correlation_type, correlation_id
  ) values (
    'notification_staff_order', 'staff@example.test', 'R', 't', '<p>h</p>',
    'failed', 5, now(), 'notification_delivery', v_delivery
  ) returning id into v_queue;

  perform set_config('test.deadline_queue_id', v_queue::text, false);
  perform private.safe_notify_terminal_email_delivery_failures(v_queue);
end;
$$;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.deadline_queue_id')::uuid
     and d.event_key = 'hr.email_delivery_failure'),
  0,
  'HR does not alert on deadline reminder failure'
);

-- Retryable: no alerts
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'auth_hook', 'retry@example.test', 'S', 't', '<p>h</p>', 'processing', 2, now()
  ) returning id into v_id;
  perform set_config('test.retry_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.retry_queue_id')::uuid, 'failed', 'temp') $$,
  'retryable failure completes'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.retry_queue_id')::uuid),
  0,
  'retryable failure creates no alerts'
);

-- Provider supplemental dispatch failure
reset role;

insert into public.lunch_providers (
  id, name, active, accepts_late_orders,
  late_order_deadline_day, late_order_deadline_time,
  supplemental_dispatch_mode, primary_order_email
)
values (
  'b0111111-1111-4111-8111-111111111111',
  'Alert Provider',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'kitchen@example.test'
);

insert into public.provider_late_order_dispatches (
  id, provider_id, scheduled_delivery_date, dispatch_type, status, provider_email
) values (
  'd0111111-1111-4111-8111-111111111111',
  'b0111111-1111-4111-8111-111111111111',
  current_date + 1,
  'manual',
  'pending',
  'kitchen@example.test'
);

select lives_ok(
  $$ select private.finalize_provider_late_order_supplement_core(
    'd0111111-1111-4111-8111-111111111111'::uuid,
    false,
    'SMTP rejected',
    null,
    false
  ) $$,
  'provider supplement finalize failed'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_provider_dispatch_id = 'd0111111-1111-4111-8111-111111111111'
     and d.event_key = 'admin.email_delivery_failure'
     and d.profile_id in ('a0111111-1111-4111-8111-111111111111', 'a0222222-2222-4222-8222-222222222222')),
  2,
  'Admin alert on provider supplemental terminal failure'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_provider_dispatch_id = 'd0111111-1111-4111-8111-111111111111'
     and d.event_key = 'hr.email_delivery_failure'
     and d.profile_id in ('a0333333-3333-4333-8333-333333333333', 'a0444444-4444-4444-8444-444444444444')),
  2,
  'HR alert on provider supplemental terminal failure'
);

select set_config(
  'test.provider_admin_delivery_id',
  (
    select d.id::text
    from private.notification_delivery_log d
    where d.failed_provider_dispatch_id = 'd0111111-1111-4111-8111-111111111111'
      and d.event_key = 'admin.email_delivery_failure'
      and d.profile_id = 'a0111111-1111-4111-8111-111111111111'
    limit 1
  ),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select c.failure_source
    from public.worker_get_admin_email_delivery_failure_context(
      current_setting('test.auth_admin_delivery_id')::uuid
    ) c
    limit 1
  ),
  'email_delivery_queue',
  'admin failure context marks queue-backed source for Email Delivery review'
);

select is(
  (
    select c.failure_source
    from public.worker_get_admin_email_delivery_failure_context(
      current_setting('test.provider_admin_delivery_id')::uuid
    ) c
    limit 1
  ),
  'provider_supplemental_dispatch',
  'admin failure context marks provider supplemental dispatch source'
);

reset role;

-- Loop prevention on admin alert message type
reset role;

do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_admin_email_delivery_failure', 'alert-admin@test.local', 'A', 't', '<p>h</p>',
    'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.admin_alert_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.admin_alert_queue_id')::uuid, 'failed', 'x') $$,
  'admin alert email terminal failure'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.admin_alert_queue_id')::uuid),
  0,
  'admin alert failure does not recurse'
);

-- Idempotency
select lives_ok(
  $$ select private.safe_notify_terminal_email_delivery_failures(current_setting('test.menu_queue_id')::uuid) $$,
  'repeat notify safe'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.menu_queue_id')::uuid
     and d.event_key = 'hr.email_delivery_failure'
     and d.profile_id = 'a0333333-3333-4333-8333-333333333333'),
  1,
  'HR idempotent per queue and recipient'
);

-- HR global off
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('hr.email_delivery_failure', false, null, null);
reset role;

do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_today_menu', 'off@example.test', 'M', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.hr_off_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.hr_off_queue_id')::uuid, 'failed', 'x') $$,
  'failure when HR global off'
);
reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.hr_off_queue_id')::uuid
     and d.event_key = 'hr.email_delivery_failure'),
  0,
  'HR global off suppresses HR alerts but admin still notified'
);

select ok(
  (select count(*)::integer from private.notification_delivery_log d
   where d.failed_email_queue_id = current_setting('test.hr_off_queue_id')::uuid
     and d.event_key = 'admin.email_delivery_failure') >= 1,
  'Admin still alerted when HR global off'
);

-- Provider primary category (future queue type)
select is(
  private.hr_email_failure_display_label('primary_lunch_order'),
  'Provider lunch orders',
  'HR label for provider primary lunch orders'
);

do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'provider_primary_lunch_order', 'kitchen@example.test', 'Orders', 't', '<p>h</p>',
    'failed', 5, now()
  ) returning id into v_id;
  perform set_config('test.provider_primary_queue_id', v_id::text, false);
end;
$$;

select is(
  private.email_queue_hr_failure_business_category(current_setting('test.provider_primary_queue_id')::uuid),
  'primary_lunch_order',
  'provider primary lunch order queue maps to HR category'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('hr.email_delivery_failure', true, null, null);

select * from finish();
rollback;
