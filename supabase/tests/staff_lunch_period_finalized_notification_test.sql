begin;

select plan(18);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f1111111-1111-4111-8111-111111111111', 'period-staff@test.local', '{"full_name":"Period Staff"}'),
  ('f1222222-2222-4222-8222-222222222222', 'period-hr@test.local', '{"full_name":"Period HR"}'),
  ('f1333333-3333-4333-8333-333333333333', 'period-accts@test.local', '{"full_name":"Period Accounts"}'),
  ('f1444444-4444-4444-8444-444444444444', 'period-admin@test.local', '{"full_name":"Period Admin"}'),
  ('f1555555-5555-4555-8555-555555555555', 'period-inactive@test.local', '{"full_name":"Period Inactive"}');

reset role;
select private.apply_profile_role('f1111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('f1222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('f1333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('f1444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('f1555555-5555-4555-8555-555555555555', 'staff');

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'f1555555-5555-4555-8555-555555555555';
select private.deactivate_trusted_account_status_change();

select ok(
  not (select enabled from private.notification_settings where event_key = 'accounts.period_ready'),
  'accounts.period_ready globally disabled'
);

select ok(
  exists (
    select 1
    from private.notification_event_catalog c
    where c.event_key = 'staff.lunch_period_finalized'
      and c.user_configurable = false
  ),
  'staff.lunch_period_finalized is not user configurable'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.create_first_lunch_period('Notice Payroll', '2099-03-01', '2099-03-15');

reset role;

select set_config('test.period_id', (select id::text from public.lunch_periods where label = 'Notice Payroll'), false);

\ir support/reconcile_lunch_period_orders.inc
select pg_temp.reconcile_lunch_period_orders_by_label('Notice Payroll');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.finalize_lunch_period(current_setting('test.period_id')::uuid) $$,
  'finalize succeeds without staff notice'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'staff.lunch_period_finalized'
     and d.lunch_period_id = current_setting('test.period_id')::uuid),
  0,
  'finalize alone does not create staff notice deliveries'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (select (public.generate_staff_lunch_period_finalized_notice(current_setting('test.period_id')::uuid) ->> 'ok')::boolean),
  true,
  'accounts can generate staff notice after finalize'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'staff.lunch_period_finalized'
     and d.lunch_period_id = current_setting('test.period_id')::uuid
     and d.profile_id in (
       'f1111111-1111-4111-8111-111111111111',
       'f1222222-2222-4222-8222-222222222222',
       'f1333333-3333-4333-8333-333333333333',
       'f1444444-4444-4444-8444-444444444444'
     )),
  4,
  'active lunch participants across roles receive delivery rows'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'staff.lunch_period_finalized'
     and d.lunch_period_id = current_setting('test.period_id')::uuid
     and d.profile_id = 'f1555555-5555-4555-8555-555555555555'),
  0,
  'inactive profile excluded'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.today_menu', false);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'staff.lunch_period_finalized'
     and d.profile_id = 'f1111111-1111-4111-8111-111111111111'),
  1,
  'staff notice ignores personal notification preferences'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.generate_staff_lunch_period_finalized_notice(current_setting('test.period_id')::uuid) $$,
  'repeat generate is safe'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'staff.lunch_period_finalized'
     and d.lunch_period_id = current_setting('test.period_id')::uuid
     and d.profile_id in (
       'f1111111-1111-4111-8111-111111111111',
       'f1222222-2222-4222-8222-222222222222',
       'f1333333-3333-4333-8333-333333333333',
       'f1444444-4444-4444-8444-444444444444'
     )),
  4,
  'repeat generate does not duplicate deliveries'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (select s.status from public.get_staff_lunch_period_finalized_notice_summary(current_setting('test.period_id')::uuid) s limit 1),
  'sending',
  'summary shows sending while pending'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (select count(*) >= 1 from public.worker_list_pending_staff_lunch_period_finalized_deliveries(10)),
  'worker lists pending staff period finalized deliveries'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.generate_staff_lunch_period_finalized_notice(current_setting('test.period_id')::uuid) $$,
  'P0001',
  'Accounts access required',
  'admin cannot initiate staff period notice'
);

-- Global off
reset role;
update private.notification_settings
set enabled = false
where event_key = 'staff.lunch_period_finalized';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (select public.generate_staff_lunch_period_finalized_notice(current_setting('test.period_id')::uuid) ->> 'code'),
  'notice_disabled',
  'global off blocks notice generation'
);

select is(
  (select status from public.lunch_periods where id = current_setting('test.period_id')::uuid),
  'finalized',
  'period remains finalized when notice disabled'
);

reset role;
update private.notification_settings
set enabled = true
where event_key = 'staff.lunch_period_finalized';

-- Terminal failure does not alert HR
reset role;

do $$
declare v_delivery uuid;
begin
  select d.id into v_delivery
  from private.notification_delivery_log d
  where d.event_key = 'staff.lunch_period_finalized'
    and d.profile_id = 'f1111111-1111-4111-8111-111111111111'
  limit 1;

  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at, correlation_type, correlation_id
  ) values (
    'notification_lunch_period_finalized', 'period-staff@test.local', 'S', 't', '<p>h</p>',
    'processing', 5, now(), 'notification_delivery', v_delivery
  );
  perform set_config('test.period_notice_queue_id', (
    select q.id::text from private.email_delivery_queue q
    where q.correlation_id = v_delivery order by q.created_at desc limit 1
  ), false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.worker_complete_email_delivery(current_setting('test.period_notice_queue_id')::uuid, 'failed', 'smtp') $$,
  'staff period notice terminal queue failure'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'hr.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.period_notice_queue_id')::uuid),
  0,
  'HR does not alert on staff lunch period finalized failure'
);

reset role;

select ok(
  (select count(*)::integer from private.notification_delivery_log d
   where d.event_key = 'admin.email_delivery_failure'
     and d.failed_email_queue_id = current_setting('test.period_notice_queue_id')::uuid) >= 1,
  'Admin alert on staff period notice terminal failure'
);

select * from finish();
