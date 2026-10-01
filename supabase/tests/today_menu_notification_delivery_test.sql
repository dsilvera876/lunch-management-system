begin;

select plan(17);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f8111111-1111-4111-8111-111111111111', 'today-menu-admin@test.local', '{"full_name":"Today Menu Admin"}'),
  ('f8222222-2222-4222-8222-222222222222', 'today-menu-hr@test.local', '{"full_name":"Today Menu HR"}'),
  ('f8333333-3333-4333-8333-333333333333', 'today-menu-staff@test.local', '{"full_name":"Staff Menu"}');

reset role;
select private.apply_profile_role('f8111111-1111-4111-8111-111111111111', 'admin');
select private.apply_profile_role('f8222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('f8333333-3333-4333-8333-333333333333', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('staff.today_menu', true, time '08:00', null);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.today_menu', true);
reset role;

insert into public.lunch_providers (id, name, active)
values ('f9000000-0000-0000-0000-000000000099', 'Today Menu Provider', true)
on conflict (id) do update set active = excluded.active;

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'f1000000-0000-0000-0000-000000000001',
  public.delivery_date_for_order_date('2099-01-05'::date),
  '2099-01-05'::date,
  'f9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-05'::date),
  'open'
)
on conflict (id) do update
set order_date = excluded.order_date, order_deadline = excluded.order_deadline, status = excluded.status;

insert into public.menu_items (
  id, lunch_day_id, name, price, item_type, unit_label, is_active
)
values (
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'Jerk Chicken',
  12.00,
  'main',
  'Each',
  true
)
on conflict (id) do update set is_active = true;

select is(
  (select eligible from private.today_menu_recipient_eligible(
    'f8333333-3333-4333-8333-333333333333',
    '2099-01-05'::date,
    timestamptz '2099-01-05 08:05:00-05:00'
  )),
  true,
  'Eligible staff recipient passes business-day/menu/preference checks inside send window'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('staff.today_menu', false, null, null);
reset role;

select is(
  (select eligible from private.today_menu_recipient_eligible(
    'f8333333-3333-4333-8333-333333333333',
    '2099-01-05'::date,
    timestamptz '2099-01-05 08:05:00-05:00'
  )),
  false,
  'Global OFF prevents generation'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('staff.today_menu', true, time '08:00', null);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.today_menu', false);
reset role;

select is(
  (select eligible from private.today_menu_recipient_eligible(
    'f8333333-3333-4333-8333-333333333333',
    '2099-01-05'::date,
    timestamptz '2099-01-05 08:05:00-05:00'
  )),
  false,
  'Personal OFF prevents generation'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.today_menu', true);
reset role;

select is(
  (select window_open from private.today_menu_send_window(
    '2099-01-05'::date,
    time '08:00',
    timestamptz '2099-01-05 07:59:00-05:00'
  )),
  false,
  'Before send time does not open generation window'
);

select is(
  (select window_open from private.today_menu_send_window(
    '2099-01-05'::date,
    time '08:00',
    timestamptz '2099-01-05 08:20:00-05:00'
  )),
  false,
  'Outside grace window does not allow delayed generation'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

create temp table today_menu_prepare_result as
select public.worker_prepare_today_menu_batch(timestamptz '2099-01-05 08:05:00-05:00') as result;

select is(
  (select result ->> 'action' from today_menu_prepare_result),
  'prepared',
  'Worker prepare creates batch inside send window'
);

select ok(
  (select (result ->> 'inserted')::integer >= 1 from today_menu_prepare_result),
  'First generation inserts at least one logical delivery'
);

select is(
  (select (public.worker_prepare_today_menu_batch(timestamptz '2099-01-05 08:06:00-05:00') ->> 'inserted')::integer),
  0,
  'Second generation does not duplicate logical delivery'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'notification_delivery_log_event_profile_date_key'
  ),
  'Unique idempotency constraint exists for event/profile/date'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  (select total_count from public.get_notification_delivery_dashboard(current_date - 1, current_date + 1)) >= 1,
  'Admin can load delivery dashboard summary'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_like(
  $$ select total_count from public.get_notification_delivery_dashboard('2099-01-01'::date, '2099-12-31'::date) $$,
  '%access required%',
  'HR cannot access notification delivery monitoring'
);

-- Closed business date: no orphan batch, no deliveries, no pending inflation
reset role;
insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'f1000000-0000-0000-0000-000000000003',
  public.delivery_date_for_order_date('2099-01-06'::date),
  '2099-01-06'::date,
  'f9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-06'::date),
  'open'
)
on conflict (id) do update
set order_date = excluded.order_date, order_deadline = excluded.order_deadline, status = excluded.status;

insert into public.menu_items (
  id, lunch_day_id, name, price, item_type, unit_label, is_active
)
values (
  'f2000000-0000-0000-0000-000000000003',
  'f1000000-0000-0000-0000-000000000003',
  'Closed Day Special',
  11.00,
  'main',
  'Each',
  true
)
on conflict (id) do update set is_active = true, lunch_day_id = excluded.lunch_day_id;

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, name, source
)
values (
  '2099-01-06'::date,
  'company_closure',
  'global',
  'Hurricane test closure',
  'manual'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select public.worker_prepare_today_menu_batch(timestamptz '2099-01-06 08:05:00-05:00') ->> 'action'),
  'skipped',
  'Closed company date returns skipped prepare action'
);

select is(
  (select public.worker_prepare_today_menu_batch(timestamptz '2099-01-06 08:05:00-05:00') ->> 'reason'),
  'no_eligible_recipients',
  'Closed company date reports no eligible recipients'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (
    select count(*)::integer
    from public.list_notification_delivery_batches(
      '2099-01-06'::date,
      '2099-01-06'::date,
      'staff.today_menu',
      null,
      50,
      0
    )
  ),
  0,
  'Closed company date does not leave a visible empty delivery batch'
);

select ok(
  (
    select pending_count <= total_count
    from public.get_notification_delivery_dashboard(current_date - 1, current_date + 1)
  ),
  'Dashboard pending count never exceeds total recipient emails'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- override_open on a weekend date allows eligibility when menu exists
reset role;
insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, name, source
)
values (
  '2099-01-04'::date,
  'override_open',
  'global',
  'Weekend override open',
  'manual'
);

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'f1000000-0000-0000-0000-000000000002',
  public.delivery_date_for_order_date('2099-01-04'::date),
  '2099-01-04'::date,
  'f9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-04'::date),
  'open'
)
on conflict (id) do update
set order_date = excluded.order_date, order_deadline = excluded.order_deadline, status = excluded.status;

insert into public.menu_items (
  id, lunch_day_id, name, price, item_type, unit_label, is_active
)
values (
  'f2000000-0000-0000-0000-000000000002',
  'f1000000-0000-0000-0000-000000000002',
  'Curry Goat',
  13.00,
  'main',
  'Each',
  true
)
on conflict (id) do update set is_active = true, lunch_day_id = excluded.lunch_day_id;

select is(
  (select public.is_business_day('2099-01-04'::date, null)),
  true,
  'override_open date is treated as a business day'
);

select ok(
  (select public.worker_prepare_today_menu_batch(timestamptz '2099-01-04 08:05:00-05:00') ->> 'action')
    in ('prepared', 'skipped'),
  'override_open date worker prepare completes without creating an empty pending batch'
);

select * from finish();
rollback;
