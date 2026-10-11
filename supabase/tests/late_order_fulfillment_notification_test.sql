begin;

select plan(14);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'eb111111-1111-4111-8111-111111111111',
  'LOFN Late Provider',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'lofn-kitchen@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time,
  primary_order_email = excluded.primary_order_email;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values (
  'eb811111-1111-4111-8111-111111111111',
  'eb111111-1111-4111-8111-111111111111',
  'LOFN Late Main',
  10.00,
  'standalone',
  'Each',
  true
)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'eb811111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('eb211111-1111-4111-8111-111111111111', 'lofn-staff@test.local', '{"full_name":"LOFN Staff"}'),
  ('eb222222-2222-4222-8222-222222222222', 'lofn-hr@test.local', '{"full_name":"LOFN HR"}'),
  ('eb233333-3333-4333-8333-333333333333', 'lofn-direct@test.local', '{"full_name":"LOFN Direct"}');

reset role;
select private.apply_profile_role('eb211111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('eb222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('eb233333-3333-4333-8333-333333333333', 'staff');

insert into public.office_locations (id, name, is_active)
values ('eb900000-0000-4000-8000-000000000001', 'LOFN Office', true)
on conflict (id) do nothing;

select private.ensure_provider_lunch_day(
  'eb111111-1111-4111-8111-111111111111',
  current_setting('test.late_order_date')::date
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'eb211111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.set_my_default_office_location('eb900000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub', 'eb233333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_default_office_location('eb900000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub', 'eb211111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.create_staff_late_order_request(
  'eb111111-1111-4111-8111-111111111111',
  current_setting('test.late_delivery_date')::date,
  'Chicken lunch please',
  1,
  null
);

reset role;
select set_config(
  'test.lofn_request_id',
  (select id::text from private.staff_late_order_requests
   where requester_profile_id = 'eb211111-1111-4111-8111-111111111111' and status = 'pending'),
  true
);
select set_config(
  'test.lofn_items',
  (
    select jsonb_build_object(
      'standalone_items',
      jsonb_build_array(jsonb_build_object('menu_item_id', mi.id, 'quantity', 1))
    )::text
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where ld.provider_id = 'eb111111-1111-4111-8111-111111111111'
      and ld.order_date = current_setting('test.late_order_date')::date
    order by mi.name
    limit 1
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'eb222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select ok(
  public.fulfill_staff_late_order_request(
    current_setting('test.lofn_request_id')::uuid,
    current_setting('test.lofn_items')::jsonb,
    'HR fulfilled',
    'eb900000-0000-4000-8000-000000000001'
  ) is not null,
  'HR fulfills the pending late-order request'
);

reset role;

select ok(
  exists (
    select 1
    from pg_locks l
    where l.locktype = 'advisory'
      and l.mode = 'ShareLock'
      and l.pid = pg_backend_pid()
      and l.granted
      and ((l.classid::bigint << 32) | l.objid::bigint) in (
        private.business_calendar_date_lock_key(current_setting('test.late_order_date')::date),
        private.business_calendar_date_lock_key(current_setting('test.late_delivery_date')::date)
      )
  ),
  'Fulfillment takes a shared business-calendar date lock'
);

select set_config(
  'test.lofn_order_id',
  (select fulfilled_order_id::text from private.staff_late_order_requests
   where id = current_setting('test.lofn_request_id')::uuid),
  true
);

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.staff_late_order_request_id = current_setting('test.lofn_request_id')::uuid
     and l.event_key = 'staff.late_order_request_fulfilled'
     and l.profile_id = 'eb211111-1111-4111-8111-111111111111'),
  1,
  'Staff receives exactly one fulfillment confirmation'
);

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.order_id = current_setting('test.lofn_order_id')::uuid
     and l.event_key like 'staff.%'),
  0,
  'Fulfillment does not queue an order-level staff email (no misleading "modified by HR")'
);

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.profile_id = 'eb211111-1111-4111-8111-111111111111'
     and l.event_key = 'staff.changed_by_hr'),
  0,
  'No staff.changed_by_hr email for the fulfilled employee'
);

select is(
  (select count(*)::integer from private.order_notification_lifecycle nl
   where nl.order_id = current_setting('test.lofn_order_id')::uuid),
  0,
  'Fulfillment records no staff order lifecycle row'
);

select is(
  (select r.event_key from private.order_notification_state_revisions r
   where r.order_id = current_setting('test.lofn_order_id')::uuid and r.revision = 1),
  null,
  'Fulfilled order state is recorded as a revision owned by no staff order event'
);

select private.notify_staff_order_event('staff.changed_by_hr', current_setting('test.lofn_order_id')::uuid);

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.order_id = current_setting('test.lofn_order_id')::uuid),
  0,
  'A stray changed_by_hr retry for the fulfilled order sends nothing'
);

select is(
  (select count(*)::integer from private.staff_late_order_request_events e
   where e.request_id = current_setting('test.lofn_request_id')::uuid
     and e.event_type = 'fulfilled'),
  1,
  'Fulfillment audit event is recorded once'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'eb222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  public.fulfill_staff_late_order_request(
    current_setting('test.lofn_request_id')::uuid,
    jsonb_build_object('standalone_items', '[]'::jsonb),
    null,
    'eb900000-0000-4000-8000-000000000001'
  ),
  current_setting('test.lofn_order_id')::uuid,
  'Repeated fulfill returns the existing order'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.profile_id = 'eb211111-1111-4111-8111-111111111111'
     and l.event_key in ('staff.late_order_request_fulfilled', 'staff.changed_by_hr')),
  1,
  'Repeated fulfill adds no further staff email'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'eb222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select ok(
  public.create_hr_late_order(
    'eb233333-3333-4333-8333-333333333333',
    'eb111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    current_setting('test.lofn_items')::jsonb,
    null,
    'eb900000-0000-4000-8000-000000000001'
  ) is not null,
  'HR can still place a direct late order'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.profile_id = 'eb233333-3333-4333-8333-333333333333'
     and l.event_key = 'staff.changed_by_hr'),
  1,
  'Direct HR late order still sends the staff.changed_by_hr email'
);

select is(
  (select count(*)::integer from private.notification_delivery_log l
   where l.profile_id = 'eb233333-3333-4333-8333-333333333333'
     and l.event_key = 'staff.late_order_request_fulfilled'),
  0,
  'Direct HR late order sends no request fulfillment email'
);

select * from finish();
rollback;
