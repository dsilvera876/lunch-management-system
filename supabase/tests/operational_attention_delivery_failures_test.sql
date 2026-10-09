begin;

select plan(47);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e0111111-1111-4111-8111-111111111111', 'oa3-admin@test.local', '{"full_name":"OA3 Admin"}'),
  ('e0222222-2222-4222-8222-222222222222', 'oa3-owner@test.local', '{"full_name":"OA3 Owner"}'),
  ('e0333333-3333-4333-8333-333333333333', 'oa3-hr-one@test.local', '{"full_name":"OA3 HR One"}'),
  ('e0444444-4444-4444-8444-444444444444', 'oa3-hr-two@test.local', '{"full_name":"OA3 HR Two"}'),
  ('e0555555-5555-4555-8555-555555555555', 'oa3-hr-off@test.local', '{"full_name":"OA3 HR Off"}'),
  ('e0666666-6666-4666-8666-666666666666', 'oa3-staff@test.local', '{"full_name":"OA3 Staff"}');

reset role;
select private.apply_profile_role('e0111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('e0222222-2222-4222-8222-222222222222', 'owner');
select private.apply_profile_role('e0333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('e0444444-4444-4444-8444-444444444444', 'hr');
select private.apply_profile_role('e0555555-5555-4555-8555-555555555555', 'hr');
select private.apply_profile_role('e0666666-6666-4666-8666-666666666666', 'staff');

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'e0555555-5555-4555-8555-555555555555';
select private.deactivate_trusted_account_status_change();

-- Terminal auth_hook: admin attention only
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'auth_hook', 'secret-recipient@example.test', 'S', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.oa3_auth_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.oa3_auth_queue_id')::uuid, 'failed', 'SMTP down') $$,
  'terminal auth_hook completes'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'admin.email_delivery_failure'
      and o.failed_email_queue_id = current_setting('test.oa3_auth_queue_id')::uuid
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Admin/Owner operational attention on terminal auth_hook failure'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.email_delivery_failure'
      and o.failed_email_queue_id = current_setting('test.oa3_auth_queue_id')::uuid
  ),
  0,
  'HR excluded from auth_hook failure attention'
);

select ok(
  not exists (
    select 1
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_auth_queue_id')::uuid
      and (o.body ilike '%secret-recipient%' or o.body ilike '%@%')
  ),
  'Attention preview omits recipient email content'
);

-- Today's menu terminal failure: admin + HR
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_today_menu', 'staff@example.test', 'Menu', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.oa3_menu_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.oa3_menu_queue_id')::uuid, 'failed', 'fail') $$,
  'terminal today menu completes'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_menu_queue_id')::uuid
      and o.event_key = 'admin.email_delivery_failure'
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Admin/Owner attention on today menu terminal failure'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_menu_queue_id')::uuid
      and o.event_key = 'hr.email_delivery_failure'
      and o.profile_id in (
        'e0333333-3333-4333-8333-333333333333',
        'e0444444-4444-4444-8444-444444444444'
      )
  ),
  2,
  'Active HR attention on today menu terminal failure'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_menu_queue_id')::uuid
      and o.profile_id = 'e0555555-5555-4555-8555-555555555555'
  ),
  0,
  'Inactive HR excluded from failure attention'
);

-- Email global off: in-app still created
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('admin.email_delivery_failure', false, null, null);
select public.update_notification_global_setting('hr.email_delivery_failure', false, null, null);
reset role;

do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_today_menu', 'global-off@example.test', 'Menu', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.oa3_global_off_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.oa3_global_off_queue_id')::uuid, 'failed', 'fail') $$,
  'terminal failure with global email notifications disabled'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.failed_email_queue_id = current_setting('test.oa3_global_off_queue_id')::uuid
  ),
  0,
  'Email delivery log skipped when global notifications disabled'
);

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_global_off_queue_id')::uuid
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0333333-3333-4333-8333-333333333333',
        'e0444444-4444-4444-8444-444444444444'
      )
  ) >= 3,
  'Operational attention still created when email channel disabled'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('admin.email_delivery_failure', true, null, null);
select public.update_notification_global_setting('hr.email_delivery_failure', true, null, null);
reset role;

-- Retryable failure: no attention rows
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'auth_hook', 'retry@example.test', 'S', 't', '<p>h</p>', 'processing', 2, now()
  ) returning id into v_id;
  perform set_config('test.oa3_retry_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.oa3_retry_queue_id')::uuid, 'failed', 'temp') $$,
  'retryable queue failure'
);

reset role;

select is(
  (
    select q.status
    from private.email_delivery_queue q
    where q.id = current_setting('test.oa3_retry_queue_id')::uuid
  ),
  'pending',
  'Retryable failure leaves queue pending'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_retry_queue_id')::uuid
  ),
  0,
  'Retryable failure creates no operational attention'
);

-- Idempotency on repeated safe notify
select is(
  private.sync_oa_admin_queue_fail(
    current_setting('test.oa3_menu_queue_id')::uuid
  ) >= 2,
  true,
  'Admin resync touches recipients'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_menu_queue_id')::uuid
      and o.event_key = 'admin.email_delivery_failure'
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Repeated sync does not duplicate admin failure attention'
);

-- Recovery: queue leaves failed -> resolve attention
select set_config(
  'test.oa3_admin_menu_attention_id',
  (
    select o.id::text
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_menu_queue_id')::uuid
      and o.profile_id = 'e0111111-1111-4111-8111-111111111111'
    limit 1
  ),
  false
);

update private.email_delivery_queue
set status = 'sent', sent_at = now()
where id = current_setting('test.oa3_menu_queue_id')::uuid;

select ok(
  (
    select o.resolved_at is not null
    from private.operational_attention_items o
    where o.id = current_setting('test.oa3_admin_menu_attention_id')::uuid
  ),
  'Queue recovery resolves operational attention for that failure'
);

-- Mark read does not resolve underlying email failure
select set_config(
  'test.oa3_auth_admin_attention_id',
  (
    select o.id::text
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_auth_queue_id')::uuid
      and o.profile_id = 'e0111111-1111-4111-8111-111111111111'
    limit 1
  ),
  false
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  public.mark_operational_attention_item_read(current_setting('test.oa3_auth_admin_attention_id')::uuid),
  true,
  'Admin can mark delivery failure attention read'
);

reset role;

select ok(
  (
    select o.read_at is not null and o.resolved_at is null
    from private.operational_attention_items o
    where o.id = current_setting('test.oa3_auth_admin_attention_id')::uuid
  ),
  'Mark read sets read_at without resolving attention item'
);

select is(
  (
    select q.status
    from private.email_delivery_queue q
    where q.id = current_setting('test.oa3_auth_queue_id')::uuid
  ),
  'failed',
  'Mark read does not change failed email queue status'
);

-- Recipient isolation via inbox RPC
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e0666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.count_my_unread_operational_attention_items() $$,
  'Operational attention inbox access required',
  'Staff role blocked from failure inbox'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  not exists (
    select 1
    from public.list_my_operational_attention_items()
    where event_key = 'hr.email_delivery_failure'
  ),
  'Admin inbox does not list HR failure events'
);

-- Provider supplemental dispatch failure attention
reset role;

insert into public.lunch_providers (
  id, name, active, accepts_late_orders,
  late_order_deadline_day, late_order_deadline_time,
  supplemental_dispatch_mode, primary_order_email
)
values (
  'e2111111-1111-4111-8111-111111111111',
  'OA3 Provider',
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
  'e3111111-1111-4111-8111-111111111111',
  'e2111111-1111-4111-8111-111111111111',
  current_date + 1,
  'manual',
  'pending',
  'kitchen@example.test'
);

select lives_ok(
  $$ select private.finalize_provider_late_order_supplement_core(
    'e3111111-1111-4111-8111-111111111111'::uuid,
    false,
    'SMTP rejected',
    null,
    false
  ) $$,
  'provider supplement finalize failed'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_dispatch_id = 'e3111111-1111-4111-8111-111111111111'
      and o.event_key = 'admin.email_delivery_failure'
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Supplemental dispatch failure creates admin/owner attention'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_dispatch_id = 'e3111111-1111-4111-8111-111111111111'
      and o.event_key = 'hr.email_delivery_failure'
      and o.profile_id in (
        'e0333333-3333-4333-8333-333333333333',
        'e0444444-4444-4444-8444-444444444444'
      )
  ),
  2,
  'Supplemental dispatch failure creates HR attention'
);

update public.provider_late_order_dispatches
set status = 'sent'
where id = 'e3111111-1111-4111-8111-111111111111';

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_dispatch_id = 'e3111111-1111-4111-8111-111111111111'
      and o.resolved_at is null
  ) = 0,
  'Dispatch recovery resolves supplemental failure attention'
);

-- Seven-day expiration excludes stale failure attention from active inbox
reset role;

select set_config(
  'test.oa3_stale_failure_id',
  private.create_operational_attention_item(
    'e0111111-1111-4111-8111-111111111111'::uuid,
    'admin.email_delivery_failure'::text,
    'Stale failure'::text,
    'Old failure row.'::text,
    '/admin/settings/email/delivery/history'::text,
    ('admin.email_delivery_failure:stale:' || gen_random_uuid()::text)::text,
    p_failed_email_queue_id => current_setting('test.oa3_auth_queue_id')::uuid
  )::text,
  false
);

update private.operational_attention_items
set created_at = now() - interval '8 days'
where id = current_setting('test.oa3_stale_failure_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (
    select count(*)::integer
    from public.list_my_operational_attention_items()
    where id = current_setting('test.oa3_stale_failure_id')::uuid
  ),
  0,
  'Failure attention older than seven days excluded from active inbox'
);

-- Email channel independence: inactive template, missing email, disabled event
reset role;

update private.notification_email_templates
set active = false
where event_key in ('admin.email_delivery_failure', 'hr.email_delivery_failure');

update auth.users
set email = ''
where id = 'e0111111-1111-4111-8111-111111111111';

do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_today_menu', 'indep@example.test', 'Menu', 't', '<p>h</p>', 'processing', 5, now()
  ) returning id into v_id;
  perform set_config('test.oa3_indep_queue_id', v_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.oa3_indep_queue_id')::uuid, 'failed', 'fail') $$,
  'terminal failure with templates off and admin email blank'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.failed_email_queue_id = current_setting('test.oa3_indep_queue_id')::uuid
  ),
  0,
  'Email delivery log empty when template inactive or recipient lacks email'
);

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_indep_queue_id')::uuid
      and o.profile_id in (
        'e0222222-2222-4222-8222-222222222222',
        'e0333333-3333-4333-8333-333333333333',
        'e0444444-4444-4444-8444-444444444444'
      )
  ) >= 3,
  'Operational attention still created independent of email channel gates'
);

update private.notification_email_templates
set active = true
where event_key in ('admin.email_delivery_failure', 'hr.email_delivery_failure');

update auth.users
set email = 'oa3-admin@test.local'
where id = 'e0111111-1111-4111-8111-111111111111';

-- Recovery: non-sent transitions must not resolve attention
do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at, last_error
  ) values (
    'notification_today_menu', 'recovery@example.test', 'Menu', 't', '<p>h</p>',
    'failed', 5, now(), 'terminal'
  ) returning id into v_id;
  perform set_config('test.oa3_recovery_queue_id', v_id::text, false);
  perform private.sync_oa_admin_queue_fail(v_id);
  perform private.sync_oa_hr_queue_fail(v_id);
end;
$$;

select set_config(
  'test.oa3_recovery_attention_id',
  (
    select o.id::text
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_recovery_queue_id')::uuid
      and o.profile_id = 'e0111111-1111-4111-8111-111111111111'
    limit 1
  ),
  false
);

update private.email_delivery_queue
set status = 'pending', last_error = 'retry scheduled'
where id = current_setting('test.oa3_recovery_queue_id')::uuid;

select ok(
  (
    select o.resolved_at is null
    from private.operational_attention_items o
    where o.id = current_setting('test.oa3_recovery_attention_id')::uuid
  ),
  'failed to pending does not resolve delivery failure attention'
);

update private.email_delivery_queue
set status = 'processing'
where id = current_setting('test.oa3_recovery_queue_id')::uuid;

select ok(
  (
    select o.resolved_at is null
    from private.operational_attention_items o
    where o.id = current_setting('test.oa3_recovery_attention_id')::uuid
  ),
  'failed to processing does not resolve delivery failure attention'
);

do $$
declare v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at, last_error
  ) values (
    'notification_today_menu', 'sent-recovery@example.test', 'Menu', 't', '<p>h</p>',
    'failed', 5, now(), 'terminal'
  ) returning id into v_id;
  perform set_config('test.oa3_sent_recovery_queue_id', v_id::text, false);
  perform private.sync_oa_admin_queue_fail(v_id);
end;
$$;

select set_config(
  'test.oa3_sent_recovery_attention_id',
  (
    select o.id::text
    from private.operational_attention_items o
    where o.failed_email_queue_id = current_setting('test.oa3_sent_recovery_queue_id')::uuid
      and o.profile_id = 'e0111111-1111-4111-8111-111111111111'
    limit 1
  ),
  false
);

update private.email_delivery_queue
set status = 'sent', sent_at = now()
where id = current_setting('test.oa3_sent_recovery_queue_id')::uuid;

select ok(
  (
    select o.resolved_at is not null
    from private.operational_attention_items o
    where o.id = current_setting('test.oa3_sent_recovery_attention_id')::uuid
  ),
  'failed to sent resolves delivery failure attention'
);

insert into public.provider_late_order_dispatches (
  id, provider_id, scheduled_delivery_date, dispatch_type, status, provider_email
) values (
  'e4111111-1111-4111-8111-111111111111',
  'e2111111-1111-4111-8111-111111111111',
  current_date + 2,
  'manual',
  'failed',
  'kitchen@example.test'
);

select ok(
  private.sync_oa_admin_supp_dispatch_fail('e4111111-1111-4111-8111-111111111111'::uuid) >= 2,
  'Supplement dispatch sync creates admin/owner attention rows'
);

update public.provider_late_order_dispatches
set status = 'attention_required'
where id = 'e4111111-1111-4111-8111-111111111111';

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_dispatch_id = 'e4111111-1111-4111-8111-111111111111'
      and o.resolved_at is null
  ) >= 2,
  'failed to attention_required keeps supplemental failure attention open'
);

-- Primary provider dispatch failure attention
insert into public.lunch_providers (
  id, name, active, primary_order_email
)
values (
  'e5111111-1111-4111-8111-111111111111',
  'OA3 Primary Provider',
  true,
  'primary-kitchen@example.test'
)
on conflict (id) do nothing;

insert into public.provider_primary_order_dispatches (
  id, provider_id, scheduled_delivery_date, dispatch_type, status, provider_email
) values (
  'e6111111-1111-4111-8111-111111111111',
  'e5111111-1111-4111-8111-111111111111',
  current_date + 3,
  'manual',
  'failed',
  'primary-kitchen@example.test'
);

select lives_ok(
  $$ select private.safe_sync_oa_primary_dispatch_fail('e6111111-1111-4111-8111-111111111111'::uuid) $$,
  'Primary dispatch failure operational sync'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_primary_dispatch_id = 'e6111111-1111-4111-8111-111111111111'
      and o.event_key = 'admin.email_delivery_failure'
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Primary dispatch failure creates admin/owner attention'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_primary_dispatch_id = 'e6111111-1111-4111-8111-111111111111'
      and o.event_key = 'hr.email_delivery_failure'
      and o.profile_id in (
        'e0333333-3333-4333-8333-333333333333',
        'e0444444-4444-4444-8444-444444444444'
      )
  ),
  2,
  'Primary dispatch failure creates HR attention'
);

select lives_ok(
  $$ select private.sync_oa_admin_primary_dispatch_fail('e6111111-1111-4111-8111-111111111111'::uuid) $$,
  'Repeat primary dispatch failure operational sync'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_primary_dispatch_id = 'e6111111-1111-4111-8111-111111111111'
      and o.event_key = 'admin.email_delivery_failure'
      and o.profile_id in (
        'e0111111-1111-4111-8111-111111111111',
        'e0222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Primary dispatch failure sync is idempotent for admin and owner'
);

update public.provider_primary_order_dispatches
set status = 'sent', sent_at = now()
where id = 'e6111111-1111-4111-8111-111111111111';

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.failed_provider_primary_dispatch_id = 'e6111111-1111-4111-8111-111111111111'
      and o.resolved_at is null
  ) = 0,
  'Primary dispatch sent status resolves failure attention'
);

-- Support Mode: admin sees own delivery failures only; HR inbox never leaks
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'oa3 delivery failure isolation') $$,
  'Admin starts HR support session for delivery failure tests'
);

select ok(
  coalesce(
    (
      select bool_and(event_key = 'admin.email_delivery_failure')
      from public.list_my_operational_attention_items()
    ),
    true
  ),
  'Support Mode admin inbox lists only caller-owned admin delivery failure items'
);

select ok(
  not exists (
    select 1
    from public.list_my_operational_attention_items()
    where event_key = 'hr.email_delivery_failure'
  ),
  'Support Mode does not expose HR delivery failure attention to admin'
);

select ok(
  exists (
    select 1
    from public.list_my_operational_attention_items()
    where event_key = 'admin.email_delivery_failure'
  ),
  'Support Mode admin still sees own admin delivery failure attention'
);

select lives_ok(
  $$ select public.end_support_session() $$,
  'Admin ends support session after delivery failure isolation tests'
);

-- Email workflow regression spot-check
reset role;

select ok(
  exists (
    select 1
    from private.notification_delivery_log d
    where d.failed_email_queue_id = current_setting('test.oa3_menu_queue_id')::uuid
      and d.event_key = 'admin.email_delivery_failure'
  ),
  'Email delivery log rows still created for terminal failures'
);

select * from finish();
rollback;
