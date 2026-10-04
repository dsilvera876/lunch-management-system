begin;

select plan(42);

select is(
  (select count(*)::integer from private.notification_event_catalog),
  15,
  'V1 catalog contains fifteen events'
);

select ok(
  not (select enabled from private.notification_settings where event_key = 'accounts.period_finalized'),
  'Deferred accounts period finalized setting is off'
);

select ok(
  exists (
    select 1
    from private.notification_event_catalog
    where event_key = 'admin.email_delivery_failure'
      and audience = 'admin'
  ),
  'Admin technical email delivery failure event exists'
);

select ok(
  not exists (
    select 1
    from private.notification_event_catalog
    where event_key = 'hr.delivery_issue_reported'
  ),
  'Delivery issue notification event removed from catalog'
);

select is(
  (select default_enabled from private.notification_event_catalog where event_key = 'staff.today_menu'),
  false,
  'Today''s Menu default staff preference is off'
);

select is(
  (select default_enabled from private.notification_event_catalog where event_key = 'staff.order_submitted'),
  true,
  'Order submitted default staff preference is on'
);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e8111111-1111-4111-8111-111111111111', 'notify-admin@test.local', '{"full_name":"Notify Admin"}'),
  ('e8222222-2222-4222-8222-222222222222', 'notify-hr@test.local', '{"full_name":"Notify HR"}'),
  ('e8333333-3333-4333-8333-333333333333', 'notify-staff-a@test.local', '{"full_name":"Staff A"}'),
  ('e8444444-4444-4444-8444-444444444444', 'notify-staff-b@test.local', '{"full_name":"Staff B"}'),
  ('e8555555-5555-4555-8555-555555555555', 'notify-accounts@test.local', '{"full_name":"Notify Accounts"}'),
  ('e8666666-6666-4666-8666-666666666666', 'notify-owner@test.local', '{"full_name":"Notify Owner"}');

reset role;
select private.apply_profile_role('e8111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('e8222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('e8333333-3333-4333-8333-333333333333', 'staff');
select private.apply_profile_role('e8444444-4444-4444-8444-444444444444', 'staff');
select private.apply_profile_role('e8555555-5555-4555-8555-555555555555', 'accounts');
select private.apply_profile_role('e8666666-6666-4666-8666-666666666666', 'owner');

-- Staff preferences
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (select personal_enabled from public.get_my_notification_preferences() where event_key = 'staff.today_menu'),
  false,
  'Staff without override uses catalog default for today menu'
);

select lives_ok(
  $$ select public.set_my_notification_preference('staff.today_menu', true) $$,
  'Staff can update own preference'
);

select is(
  (select personal_enabled from public.get_my_notification_preferences() where event_key = 'staff.today_menu'),
  true,
  'Staff preference override stored'
);

select throws_ok(
  $$ select public.set_my_notification_preference('hr.pending_signup_approval', true) $$,
  'P0001',
  null,
  'Staff cannot modify non-user-configurable events'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_notification_preference('staff.order_submitted', false) $$,
  'Another staff profile can save preference'
);

reset role;

select is(
  (select enabled from private.staff_notification_preferences
   where profile_id = 'e8333333-3333-4333-8333-333333333333'
     and event_key = 'staff.today_menu'),
  true,
  'Staff A preference row persisted'
);

-- Global disable preserves personal preference
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_notification_global_setting('staff.today_menu', false, null, null) $$,
  'Admin can disable global notification'
);

reset role;

select is(
  (select enabled from private.staff_notification_preferences
   where profile_id = 'e8333333-3333-4333-8333-333333333333'
     and event_key = 'staff.today_menu'),
  true,
  'Global disable does not erase personal preference'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (select globally_disabled from public.get_my_notification_preferences()
   where event_key = 'staff.today_menu'),
  true,
  'Staff RPC reports globally disabled state'
);

-- HR cannot manage global settings
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.today_menu', true, null, null) $$,
  'P0001',
  null,
  'HR cannot update global notification settings'
);

select throws_ok(
  $$ select * from public.list_admin_notification_events('staff') $$,
  'P0001',
  null,
  'HR cannot list admin notification settings'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.today_menu', true, time '09:00', null) $$,
  'P0001',
  null,
  'Accounts cannot update global notification settings'
);

-- Admin can update configurable timing
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_notification_global_setting('staff.today_menu', false, time '09:15', null) $$,
  'Admin can update Today''s Menu send time'
);

reset role;

select is(
  (select send_time from private.notification_settings where event_key = 'staff.today_menu'),
  time '09:15',
  'Today''s Menu send_time persisted'
);

select lives_ok(
  $$ select public.update_notification_global_setting('staff.deadline_reminder', true, null, 45) $$,
  'Admin can update deadline reminder offset'
);

reset role;

select is(
  (select minutes_before_deadline from private.notification_settings where event_key = 'staff.deadline_reminder'),
  45,
  'Deadline reminder offset persisted'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_notification_global_setting('staff.deadline_reminder', true, null, 60) $$,
  'Owner can update deadline reminder offset'
);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.deadline_reminder', true, null, 4) $$,
  'P0001',
  'Minutes before deadline must be between 5 and 240',
  'Reminder offset below minimum rejected'
);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.deadline_reminder', true, null, 241) $$,
  'P0001',
  'Minutes before deadline must be between 5 and 240',
  'Reminder offset above maximum rejected'
);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.order_submitted', true, time '08:00', null) $$,
  'P0001',
  'Send time is not configurable for this notification',
  'Immediate event send time mutation rejected'
);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.order_submitted', true, null, 30) $$,
  'P0001',
  'Reminder offset is not configurable for this notification',
  'Immediate event reminder offset mutation rejected'
);

-- Admin Email Settings omits dormant / non-catalog-controlled events
select ok(
  not exists (
    select 1
    from public.list_admin_notification_events('accounts') e
    where e.event_key = 'accounts.period_ready'
  ),
  'accounts.period_ready is not listed in Email Settings'
);

select ok(
  not exists (
    select 1
    from public.list_admin_notification_events('accounts') e
    where e.event_key = 'accounts.period_finalized'
  ),
  'accounts.period_finalized is not listed in Email Settings'
);

select is(
  (select count(*)::integer from public.list_admin_notification_events('accounts')),
  0,
  'Accounts Notifications audience has no admin-configurable events'
);

select ok(
  not exists (
    select 1
    from public.list_admin_notification_events('provider') e
    where e.event_key = 'provider.late_order_supplement'
  ),
  'provider.late_order_supplement is not listed in Email Settings'
);

select ok(
  exists (
    select 1
    from public.list_admin_notification_events('provider') e
    where e.event_key = 'provider.daily_order_summary'
  ),
  'provider.daily_order_summary remains listed in Email Settings'
);

select ok(
  exists (
    select 1
    from public.list_admin_notification_events('staff') e
    where e.event_key = 'staff.today_menu'
  ),
  'Staff notifications listing is unchanged for today menu'
);

select ok(
  exists (
    select 1
    from public.list_admin_notification_events('hr') e
    where e.event_key = 'hr.pending_signup_approval'
  ),
  'HR notifications listing is unchanged for pending signup approval'
);

select throws_ok(
  $$ select public.update_notification_global_setting('accounts.period_ready', false, null, null) $$,
  'P0001',
  'Notification global setting is not manageable in Email Settings',
  'Dormant accounts.period_ready global toggle update rejected'
);

select throws_ok(
  $$ select public.update_notification_global_setting('provider.late_order_supplement', false, null, null) $$,
  'P0001',
  'Notification global setting is not manageable in Email Settings',
  'provider.late_order_supplement global toggle update rejected'
);

-- Support mode does not grant notification settings access to HR
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'notification timing test') $$,
  'Admin can start HR support for notification auth test'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.update_notification_global_setting('staff.today_menu', true, time '10:00', null) $$,
  'P0001',
  null,
  'HR cannot update timing while admin HR support is active'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.end_support_session() $$,
  'Admin ends support session after notification auth test'
);

-- Template validation
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    select public.upsert_notification_email_template(
      'staff.today_menu',
      'Bad {{unknown_variable}}',
      '<p>Hi</p>',
      null,
      true
    )
  $$,
  'P0001',
  null,
  'Unsupported template variables rejected'
);

select lives_ok(
  $$
    select public.upsert_notification_email_template(
      'staff.today_menu',
      'Today''s Lunch Menu — {{menu_date}}',
      '<p>Hi {{first_name}}</p>',
      null,
      true
    )
  $$,
  'Supported template variables save'
);

reset role;

select is(
  (select count(*)::integer from private.notification_email_templates where event_key = 'staff.today_menu'),
  1,
  'Today''s Menu template exists'
);

select * from finish();
rollback;
