begin;

select plan(29);

\ir support/isolate_existing_owner.inc

update public.app_settings
set order_cutoff_time = '18:00:00'
where id = 1;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b8111111-1111-4111-8111-111111111111', 'deadline-reminder-admin@test.local', '{"full_name":"DR Admin"}'),
  ('b8222222-2222-4222-8222-222222222222', 'deadline-reminder-hr@test.local', '{"full_name":"DR HR"}'),
  ('b8333333-3333-4333-8333-333333333333', 'deadline-reminder-staff@test.local', '{"full_name":"DR Staff"}'),
  ('b8444444-4444-4444-8444-444444444444', 'deadline-reminder-ordered@test.local', '{"full_name":"DR Ordered"}'),
  ('b8555555-5555-4555-8555-555555555555', 'deadline-reminder-cancel@test.local', '{"full_name":"DR Cancel"}'),
  ('b8666666-6666-4666-8666-666666666666', 'deadline-reminder-inactive@test.local', '{"full_name":"DR Inactive"}');

reset role;
select private.apply_profile_role('b8111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('b8222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('b8333333-3333-4333-8333-333333333333', 'staff');
select private.apply_profile_role('b8444444-4444-4444-8444-444444444444', 'staff');
select private.apply_profile_role('b8555555-5555-4555-8555-555555555555', 'staff');
select private.apply_profile_role('b8666666-6666-4666-8666-666666666666', 'staff');

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'b8666666-6666-4666-8666-666666666666';
select private.deactivate_trusted_account_status_change();

insert into public.lunch_providers (id, name, active, primary_order_email)
values ('b9000000-0000-0000-0000-000000000099', 'Deadline Reminder Provider', true, 'provider-order+fixture@example.test')
on conflict (id) do update set active = excluded.active,
  primary_order_email = excluded.primary_order_email;

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'b1000000-0000-0000-0000-000000000001',
  public.delivery_date_for_order_date('2099-01-05'::date),
  '2099-01-05'::date,
  'b9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-05'::date),
  'open'
)
on conflict (id) do update
set order_date = excluded.order_date, order_deadline = excluded.order_deadline, status = excluded.status;

insert into public.menu_items (
  id, lunch_day_id, name, price, item_type, unit_label, is_active
)
values (
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'Reminder Main',
  12.00,
  'main',
  'Each',
  true
)
on conflict (id) do update set is_active = true;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('staff.deadline_reminder', true, null, 30);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.deadline_reminder', true);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.deadline_reminder', true);
reset role;

-- A. active Staff, no order, preference ON, global ON
select is(
  (select eligible from private.deadline_reminder_recipient_eligible(
    'b8333333-3333-4333-8333-333333333333',
    '2099-01-05'::date,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  true,
  'A: active staff with preference ON is eligible inside reminder window'
);

-- B. active HR user, no order, preference ON
select is(
  (select eligible from private.deadline_reminder_recipient_eligible(
    'b8222222-2222-4222-8222-222222222222',
    '2099-01-05'::date,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  true,
  'B: active HR lunch participant with preference ON is eligible'
);

-- C. user already has active order
\ir support/submit_order_lunch_day_fixture.inc
\ir support/assign_test_office_defaults.inc

reset role;
update public.lunch_days
set order_date = '2099-01-05'::date,
    lunch_date = public.delivery_date_for_order_date('2099-01-05'::date),
    order_deadline = public.order_deadline_for_order_date('2099-01-05'::date)
where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.deadline_reminder', true);

select public.submit_order(
  '10000000-0000-0000-0000-000000000001',
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
    ]
  }'::jsonb
);
reset role;

select is(
  (select reason from private.deadline_reminder_recipient_eligible(
    'b8444444-4444-4444-8444-444444444444',
    '2099-01-05'::date,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  'already_ordered',
  'C: active submitted order skips with already_ordered'
);

-- D. user has only cancelled order
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.deadline_reminder', true);

select public.submit_order(
  '10000000-0000-0000-0000-000000000001',
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
    ]
  }'::jsonb
);

select public.cancel_order(
  (
    select o.id
    from public.orders o
    where o.profile_id = 'b8555555-5555-4555-8555-555555555555'
      and o.status = 'submitted'
    order by o.created_at desc
    limit 1
  )
);
reset role;

select is(
  (select eligible from private.deadline_reminder_recipient_eligible(
    'b8555555-5555-4555-8555-555555555555',
    '2099-01-05'::date,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  true,
  'D: cancelled-only order history remains eligible'
);

-- E. inactive profile
select is(
  (select reason from private.deadline_reminder_recipient_eligible(
    'b8666666-6666-4666-8666-666666666666',
    '2099-01-05'::date,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  'account_inactive',
  'E: inactive profile is skipped'
);

-- F. personal preference OFF
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.deadline_reminder', false);
reset role;

select is(
  (select reason from private.deadline_reminder_recipient_eligible(
    'b8333333-3333-4333-8333-333333333333',
    '2099-01-05'::date,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  'preference_disabled',
  'F: personal preference OFF skips recipient'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.deadline_reminder', true);
reset role;

-- Timing: before target window
select is(
  (select window_open from private.deadline_reminder_send_window(
    '2099-01-05'::date,
    30,
    timestamptz '2099-01-05 17:29:00-05:00'
  )),
  false,
  'Before target reminder time does not open send window'
);

select is(
  (select window_open from private.deadline_reminder_send_window(
    '2099-01-05'::date,
    30,
    timestamptz '2099-01-05 17:30:00-05:00'
  )),
  true,
  'At target reminder time window opens'
);

select is(
  (select window_open from private.deadline_reminder_send_window(
    '2099-01-05'::date,
    30,
    timestamptz '2099-01-05 17:44:00-05:00'
  )),
  true,
  'Inside 15-minute grace window remains eligible'
);

select is(
  (select window_open from private.deadline_reminder_send_window(
    '2099-01-05'::date,
    30,
    timestamptz '2099-01-05 17:46:00-05:00'
  )),
  false,
  'After grace window there is no late catch-up'
);

select is(
  (select reminder_send_time from private.deadline_reminder_send_window(
    '2099-01-05'::date,
    30,
    timestamptz '2099-01-05 17:35:00-05:00'
  )),
  time '17:30',
  'Reminder send time derives from authoritative order deadline minus configured minutes'
);

-- G. global event OFF
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('staff.deadline_reminder', false, null, 30);
reset role;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select public.worker_prepare_deadline_reminder_batch(timestamptz '2099-01-05 17:35:00-05:00') ->> 'reason'),
  'globally_disabled',
  'G: global OFF prevents generation'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_processing_run
    where event_key = 'staff.deadline_reminder'
      and operational_date = '2099-01-05'::date
  ),
  0,
  'G: globally disabled prepare does not create processing audit row'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('staff.deadline_reminder', true, null, 30);
reset role;

-- H. no applicable menu (non-weekday order date has no catalog menu)
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select public.worker_prepare_deadline_reminder_batch(timestamptz '2099-01-04 17:35:00-05:00') ->> 'reason'),
  'no_applicable_menu',
  'H: no applicable menu skips batch with no_applicable_menu'
);

-- I. business day closed
reset role;

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, name, source
)
values (
  '2099-01-08'::date,
  'company_closure',
  'global',
  'Deadline reminder closure test',
  'manual'
);

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'b1000000-0000-0000-0000-000000000002',
  '2099-01-09'::date,
  '2099-01-08'::date,
  'b9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-08'::date),
  'open'
)
on conflict (id) do update
set order_date = excluded.order_date, lunch_date = excluded.lunch_date, order_deadline = excluded.order_deadline;

insert into public.menu_items (
  id, lunch_day_id, name, price, item_type, unit_label, is_active
)
values (
  'b2000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000002',
  'Closed Day Main',
  12.00,
  'main',
  'Each',
  true
)
on conflict (id) do update set is_active = true;

select is(
  (select reason from private.deadline_reminder_recipient_eligible(
    'b8333333-3333-4333-8333-333333333333',
    '2099-01-08'::date,
    timestamptz '2099-01-08 17:35:00-05:00'
  )),
  'business_day_closed',
  'I: closed business calendar date skips recipient'
);

-- J. finalized period
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values ('b8777777-7777-4777-8777-777777777777', 'deadline-reminder-acct@test.local', '{"full_name":"DR Accounts"}')
on conflict (id) do nothing;

reset role;
select private.apply_profile_role('b8777777-7777-4777-8777-777777777777', 'accounts');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8777777-7777-4777-8777-777777777777', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('Deadline Reminder Guard', '2099-02-01', '2099-02-28');
select public.set_current_lunch_period(id)
from public.lunch_periods
where label = 'Deadline Reminder Guard';
\ir support/reconcile_lunch_period_orders.inc
select pg_temp.reconcile_lunch_period_orders_by_label('Deadline Reminder Guard');
select public.finalize_lunch_period(
  (select id from public.lunch_periods where label = 'Deadline Reminder Guard')
);
reset role;

select is(
  (select reason from private.deadline_reminder_recipient_eligible(
    'b8333333-3333-4333-8333-333333333333',
    '2099-02-10'::date,
    timestamptz '2099-02-10 17:35:00-05:00'
  )),
  'period_finalized',
  'J: finalized lunch period skips recipient'
);

-- Idempotency + processing audit on 2099-01-05
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

create temp table deadline_first_prepare as
select public.worker_prepare_deadline_reminder_batch(timestamptz '2099-01-05 17:35:00-05:00') as result;

select is(
  (select result ->> 'action' from deadline_first_prepare),
  'prepared',
  'Worker prepare creates deliveries inside reminder window'
);

select ok(
  ((select result ->> 'inserted' from deadline_first_prepare)::integer >= 1),
  'First generation inserts at least one logical delivery'
);

select is(
  (select (public.worker_prepare_deadline_reminder_batch(timestamptz '2099-01-05 17:36:00-05:00') ->> 'inserted')::integer),
  0,
  'Repeated worker runs do not duplicate delivery intents'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_processing_run
    where event_key = 'staff.deadline_reminder'
      and operational_date = '2099-01-05'::date
      and scheduled_send_time = time '17:30'
  ),
  1,
  'Repeated worker checks upsert one processing audit row per scheduled occurrence'
);

select ok(
  (
    select run_count >= 2
    from private.notification_processing_run
    where event_key = 'staff.deadline_reminder'
      and operational_date = '2099-01-05'::date
      and scheduled_send_time = time '17:30'
  ),
  'Processing audit increments run_count across repeated worker checks'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  coalesce((select result -> 'skip_reason_counts' ->> 'already_ordered' from deadline_first_prepare)::integer, 0) >= 1,
  'Skip reason counts include already_ordered when applicable'
);

-- Later cancellation does not create a second reminder if already generated
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select public.cancel_order(
  (
    select o.id
    from public.orders o
    where o.profile_id = 'b8444444-4444-4444-8444-444444444444'
      and o.status = 'submitted'
    limit 1
  )
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  coalesce(
    (
      public.worker_prepare_deadline_reminder_batch(timestamptz '2099-01-05 17:37:00-05:00')
        -> 'skip_reason_counts' ->> 'already_generated'
    )::integer,
    0
  ) >= 1,
  'After prior reminder generation, cancellation does not allow a second reminder'
);

-- Template + queue snapshots
reset role;

select throws_ok(
  $$
    select private.assert_notification_template_variables(
      'staff.deadline_reminder',
      'Bad {{unknown_var}}',
      '<p>Hi</p>',
      null
    )
  $$,
  'Unsupported template variables: unknown_var',
  'Unsupported template variables are rejected'
);

select ok(
  not coalesce(
    (
      select t.body_html_template like '%Jamaica time%'
      from private.notification_email_templates t
      where t.event_key = 'staff.deadline_reminder'
    ),
    false
  ),
  'Default deadline reminder template does not contain Jamaica time wording'
);

reset role;

do $$
declare
  v_delivery_id uuid;
begin
  select d.id
  into v_delivery_id
  from private.notification_delivery_log d
  where d.event_key = 'staff.deadline_reminder'
    and d.profile_id = 'b8222222-2222-4222-8222-222222222222'
    and d.status = 'pending'
  order by d.created_at
  limit 1;

  perform set_config('test.deadline_reminder_delivery_id', v_delivery_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select public.worker_queue_notification_delivery(
      current_setting('test.deadline_reminder_delivery_id')::uuid,
      'deadline-reminder-hr@test.local',
      'Lunch ordering closes soon',
      'Text body',
      '<p>Html body</p>'
    )
  $$,
  'Worker queue stores rendered snapshots for deadline reminder'
);

reset role;

select ok(
  (
    select rendered_subject
    from private.notification_delivery_log d
    where d.id = current_setting('test.deadline_reminder_delivery_id')::uuid
  ) = 'Lunch ordering closes soon',
  'Delivery log retains rendered subject snapshot'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

create temp table deadline_dashboard_before as
select total_count as before_total
from public.get_notification_delivery_dashboard(current_date - 1, current_date + 1);

reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select public.worker_prepare_deadline_reminder_batch(timestamptz '2099-01-05 17:38:00-05:00');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select total_count from public.get_notification_delivery_dashboard(current_date - 1, current_date + 1)),
  (select before_total from deadline_dashboard_before),
  'Skipped-only processing passes do not inflate email dashboard totals by themselves'
);

select ok(
  exists (
    select 1
    from public.list_notification_processing_runs('2099-01-05'::date, '2099-01-05'::date, 10, 0)
    where event_key = 'staff.deadline_reminder'
  ),
  'Admin can list deadline reminder processing activity'
);

select * from finish();
rollback;
