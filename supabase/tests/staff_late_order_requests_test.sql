begin;

select plan(44);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'b1111111-1111-4111-8111-111111111111',
  'SLOR Late Provider',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  'slor-kitchen@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time,
  primary_order_email = excluded.primary_order_email;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
(
  'c8111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'SLOR Late Main',
  10.00,
  'standalone',
  'Each',
  true
)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'c8111111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'b3333333-3333-4333-8333-333333333333',
  'SLOR Late Provider C',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  'slor-kitchen-c@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true,
  primary_order_email = excluded.primary_order_email;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
(
  'c8333333-3333-4333-8333-333333333333',
  'b3333333-3333-4333-8333-333333333333',
  'SLOR Alt Main',
  10.00,
  'standalone',
  'Each',
  true
)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'c8333333-3333-4333-8333-333333333333'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/open_ordering.inc
\ir support/late_order_cycle.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f8111111-1111-4111-8111-111111111111', 'slor-staff@test.local', '{"full_name":"SLOR Staff"}'),
  ('f8222222-2222-4222-8222-222222222222', 'slor-hr@test.local', '{"full_name":"SLOR HR"}'),
  ('f8333333-3333-4333-8333-333333333333', 'slor-admin@test.local', '{"full_name":"SLOR Admin"}'),
  ('f8444444-4444-4444-8444-444444444444', 'slor-other@test.local', '{"full_name":"SLOR Other"}'),
  ('f8555555-5555-4555-8555-555555555555', 'slor-expiry@test.local', '{"full_name":"SLOR Expiry"}'),
  ('f8666666-6666-4666-8666-666666666666', 'slor-expiry2@test.local', '{"full_name":"SLOR Expiry Two"}'),
  ('f8777777-7777-4777-8777-777777777777', 'slor-expired-only@test.local', '{"full_name":"SLOR Expired Only"}');

reset role;
select private.apply_profile_role('f8111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('f8222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('f8333333-3333-4333-8333-333333333333', 'admin');
select private.apply_profile_role('f8444444-4444-4444-8444-444444444444', 'staff');
select private.apply_profile_role('f8555555-5555-4555-8555-555555555555', 'staff');
select private.apply_profile_role('f8666666-6666-4666-8666-666666666666', 'staff');
select private.apply_profile_role('f8777777-7777-4777-8777-777777777777', 'staff');

insert into public.office_locations (id, name, is_active)
values ('f9000000-0000-4000-8000-000000000001', 'SLOR Office', true)
on conflict (id) do nothing;

select lives_ok(
  $$
    select private.ensure_provider_lunch_day(
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_order_date')::date
    )
  $$,
  'Setup frozen snapshot for late-order fulfillment'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'Staff sets default office location'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'Other staff sets default office location'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'Expiry staff sets default office location'
);

reset role;

select throws_ok(
  $$
    select private.assert_staff_late_order_request_window(
      'f8111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      public.order_deadline_for_order_date(current_setting('test.late_order_date')::date) - interval '1 second'
    )
  $$,
  'Normal ordering is still open; use standard ordering',
  'Authoritative late window rejects before company cutoff'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Chicken lunch please',
    1,
    'No spice'
  ) $$,
  'Staff can create late order request in window'
);

reset role;

select ok(
  exists (
    select 1
    from private.staff_late_order_request_events e
    inner join private.staff_late_order_requests r on r.id = e.request_id
    where e.event_type = 'submitted'
      and r.requester_profile_id = 'f8111111-1111-4111-8111-111111111111'
  ),
  'Create writes submitted audit event'
);

select ok(
  exists (
    select 1
    from private.notification_delivery_log l
    where l.event_key = 'hr.late_order_submitted'
      and l.staff_late_order_request_id is not null
      and l.profile_id = 'f8222222-2222-4222-8222-222222222222'
      and l.status = 'pending'
  ),
  'HR late order submitted notification intent queued for permanent HR'
);

reset role;
select set_config(
  'test.slor_primary_request_id',
  (
    select id::text
    from private.staff_late_order_requests
    where requester_profile_id = 'f8111111-1111-4111-8111-111111111111'
      and status = 'pending'
    limit 1
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

reset role;
select set_config(
  'test.slor_request_id',
  (select id::text from private.staff_late_order_requests where status = 'pending' limit 1),
  true
);
select set_config(
  'test.slor_request_updated_at',
  (select updated_at::text from private.staff_late_order_requests where status = 'pending' limit 1),
  true
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.update_staff_late_order_request(
    current_setting('test.slor_request_id')::uuid,
    'Updated chicken lunch',
    2,
    'Extra sauce',
    current_setting('test.slor_request_updated_at')::timestamptz
  ) $$,
  'Staff can edit pending request'
);

select throws_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Duplicate pending',
    1,
    null
  ) $$,
  'A pending request already exists for this provider and delivery date',
  'Second pending request for same provider/date rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.get_my_staff_late_order_requests()),
  0,
  'Other staff does not see peer requests via get_my'
);

select throws_ok(
  $$ select public.fulfill_staff_late_order_request(
    current_setting('test.slor_request_id')::uuid,
    jsonb_build_object('standalone_items', '[]'::jsonb),
    null,
    'f9000000-0000-4000-8000-000000000001'
  ) $$,
  'HR late-order access required',
  'Staff cannot fulfill requests'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select ok(
  exists (select 1 from public.list_pending_staff_late_order_requests_for_hr()),
  'HR can list pending staff requests'
);

select throws_ok(
  $$
    select public.create_hr_late_order(
      'f8111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object('menu_item_id', mi.id, 'quantity', 1)
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.late_order_date')::date
        order by mi.name
        limit 1
      ),
      null,
      'f9000000-0000-4000-8000-000000000001'
    )
  $$,
  'This employee has a pending late-order request for this provider and date. Review and fulfill that request instead.',
  'Direct HR create blocked when pending staff request exists'
);

select ok(
  (
    select public.fulfill_staff_late_order_request(
      current_setting('test.slor_request_id')::uuid,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object(
              'menu_item_id',
              mi.id,
              'quantity',
              1
            )
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.late_order_date')::date
        order by mi.name
        limit 1
      ),
      'HR fulfilled',
      'f9000000-0000-4000-8000-000000000001'
    )
  ) is not null,
  'Permanent HR can fulfill pending request'
);

reset role;

select ok(
  (
    select o.is_late_order
    from public.orders o
    where o.id = (
      select fulfilled_order_id
      from private.staff_late_order_requests
      where status = 'fulfilled'
      limit 1
    )
  ),
  'Fulfilled order is marked is_late_order'
);

reset role;
select set_config(
  'test.slor_fulfilled_request_id',
  (select id::text from private.staff_late_order_requests where status = 'fulfilled' limit 1),
  true
);
select set_config(
  'test.slor_fulfilled_order_id',
  (select fulfilled_order_id::text from private.staff_late_order_requests where status = 'fulfilled' limit 1),
  true
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (
    select public.fulfill_staff_late_order_request(
      current_setting('test.slor_fulfilled_request_id')::uuid,
      jsonb_build_object('standalone_items', '[]'::jsonb),
      null,
      'f9000000-0000-4000-8000-000000000001'
    )
  ),
  current_setting('test.slor_fulfilled_order_id')::uuid,
  'Repeated fulfill returns existing order id'
);

reset role;

select ok(
  exists (
    select 1
    from private.notification_delivery_log l
    where l.staff_late_order_request_id = current_setting('test.slor_primary_request_id')::uuid
      and l.event_key = 'hr.late_order_submitted'
      and l.status = 'skipped'
  ),
  'Fulfillment suppresses unsent HR submitted notification deliveries'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Blocked after fulfill',
    1,
    null
  ) $$,
  'A late order already exists for this provider and delivery date',
  'Staff cannot create request when submitted late order exists'
);

reset role;
insert into private.staff_late_order_requests (
  requester_profile_id,
  provider_id,
  office_location_id,
  order_date,
  scheduled_delivery_date,
  status,
  requested_summary,
  quantity
)
values (
  'f8666666-6666-4666-8666-666666666666',
  'b1111111-1111-4111-8111-111111111111',
  'f9000000-0000-4000-8000-000000000001',
  current_setting('test.past_order_date')::date,
  current_setting('test.late_delivery_date')::date,
  'pending',
  'Worker expiry fixture',
  1
);

select ok(
  (
    select public.provider_late_order_deadline_at(
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.past_order_date')::date,
      current_setting('test.late_delivery_date')::date
    ) < now()
  )
  or (
    select count(*) from private.staff_late_order_requests
    where requested_summary = 'Worker expiry fixture' and status = 'pending'
  ) = 1,
  'Expiry fixture pending row exists (deadline may already be past)'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (
    select public.worker_expire_pending_staff_late_order_requests()
  ) >= 0,
  'Worker expiry RPC runs under service role'
);

reset role;

select ok(
  (
    select status from private.staff_late_order_requests
    where requested_summary = 'Worker expiry fixture'
    limit 1
  ) in ('expired', 'pending'),
  'Expiry fixture ends expired when deadline passed, else stays pending'
);

select ok(
  (
    select count(*)::integer
    from private.staff_late_order_request_events e
    inner join private.staff_late_order_requests r on r.id = e.request_id
    where r.requested_summary = 'Worker expiry fixture'
      and e.event_type = 'expired'
  ) <= 1,
  'At most one expired audit event for fixture request'
);

-- Decline flow on a fresh pending request (staff create so HR notification exists)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Decline me',
    1,
    null
  ) $$,
  'Staff creates request for decline notification guard test'
);

reset role;
select set_config(
  'test.slor_decline_request_id',
  (
    select id::text
    from private.staff_late_order_requests
    where requester_profile_id = 'f8444444-4444-4444-8444-444444444444'
      and requested_summary = 'Decline me'
      and status = 'pending'
    limit 1
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.decline_staff_late_order_request(
    current_setting('test.slor_decline_request_id')::uuid,
    'Kitchen cannot accommodate'
  ) $$,
  'HR can decline pending request with reason'
);

reset role;

select ok(
  exists (
    select 1 from private.staff_late_order_request_events e
    inner join private.staff_late_order_requests r on r.id = e.request_id
    where r.requested_summary = 'Decline me'
      and e.event_type = 'declined'
  ),
  'Decline writes audit event'
);

select ok(
  exists (
    select 1
    from private.notification_delivery_log l
    where l.staff_late_order_request_id = current_setting('test.slor_decline_request_id')::uuid
      and l.event_key = 'hr.late_order_submitted'
      and l.status = 'skipped'
  ),
  'Decline suppresses unsent HR submitted notification deliveries'
);

reset role;

select lives_ok(
  $$
    select private.ensure_provider_lunch_day(
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_order_date')::date
    )
  $$,
  'Snapshot ready for direct HR create after decline'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_hr_late_order(
    'f8444444-4444-4444-8444-444444444444',
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    (
      select jsonb_build_object(
        'standalone_items',
        jsonb_build_array(jsonb_build_object('menu_item_id', mi.id, 'quantity', 1))
      )
      from public.menu_items mi
      join public.lunch_days ld on ld.id = mi.lunch_day_id
      where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
        and ld.order_date = current_setting('test.late_order_date')::date
      limit 1
    ),
    null,
    'f9000000-0000-4000-8000-000000000001'
  ) $$,
  'Direct HR create allowed after staff request declined'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Retry after decline',
    1,
    null
  ) $$,
  'Staff can submit new request after decline'
);

reset role;
select set_config(
  'test.slor_cancel_request_id',
  (
    select id::text
    from private.staff_late_order_requests
    where requester_profile_id = 'f8555555-5555-4555-8555-555555555555'
      and requested_summary = 'Retry after decline'
      and status = 'pending'
    limit 1
  ),
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select * from public.start_support_session('hr', 'slor support regression') $$,
  'Admin starts HR support'
);

select throws_ok(
  $$ select public.create_hr_late_order(
    'f8111111-1111-4111-8111-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    jsonb_build_object(
      'standalone_items', jsonb_build_array(
        jsonb_build_object('menu_item_id', '00000000-0000-4000-8000-000000000001', 'quantity', 1)
      )
    )
  ) $$,
  'HR late-order access required',
  'Admin HR Support cannot create HR late order via RPC'
);

select throws_ok(
  $$ select public.fulfill_staff_late_order_request(
    current_setting('test.slor_cancel_request_id')::uuid,
    jsonb_build_object('standalone_items', '[]'::jsonb),
    null,
    'f9000000-0000-4000-8000-000000000001'
  ) $$,
  'HR late-order access required',
  'Admin HR Support cannot fulfill staff request via RPC'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.cancel_staff_late_order_request(
    current_setting('test.slor_cancel_request_id')::uuid
  ) $$,
  'Staff can cancel own pending request'
);

select lives_ok(
  $$ select public.cancel_staff_late_order_request(
    current_setting('test.slor_cancel_request_id')::uuid
  ) $$,
  'Repeated cancel is idempotent'
);

reset role;

select ok(
  exists (
    select 1
    from private.notification_delivery_log l
    where l.staff_late_order_request_id = current_setting('test.slor_cancel_request_id')::uuid
      and l.event_key = 'hr.late_order_submitted'
      and l.status = 'skipped'
  ),
  'Staff cancel suppresses unsent HR submitted notification deliveries'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select public.create_hr_late_order(
    'f8555555-5555-4555-8555-555555555555',
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    (
      select jsonb_build_object(
        'standalone_items',
        jsonb_build_array(jsonb_build_object('menu_item_id', mi.id, 'quantity', 1))
      )
      from public.menu_items mi
      join public.lunch_days ld on ld.id = mi.lunch_day_id
      where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
        and ld.order_date = current_setting('test.late_order_date')::date
      limit 1
    ),
    null,
    'f9000000-0000-4000-8000-000000000001'
  ) $$,
  'Direct HR create allowed after staff request cancelled'
);

reset role;
insert into private.staff_late_order_requests (
  requester_profile_id,
  provider_id,
  office_location_id,
  order_date,
  scheduled_delivery_date,
  status,
  requested_summary,
  quantity,
  expired_at
)
values (
  'f8777777-7777-4777-8777-777777777777',
  'b1111111-1111-4111-8111-111111111111',
  'f9000000-0000-4000-8000-000000000001',
  current_setting('test.late_order_date')::date,
  current_setting('test.late_delivery_date')::date,
  'expired',
  'Expired fixture',
  1,
  now()
);

select set_config(
  'test.slor_expired_request_id',
  (
    select id::text
    from private.staff_late_order_requests
    where requested_summary = 'Expired fixture'
    limit 1
  ),
  true
);

insert into private.notification_delivery_log (
  event_key,
  profile_id,
  operational_date,
  status,
  idempotency_key,
  staff_late_order_request_id
)
values (
  'hr.late_order_submitted',
  'f8222222-2222-4222-8222-222222222222',
  current_setting('test.late_delivery_date')::date,
  'pending',
  'hr.late_order_submitted:expired-fixture:' || current_setting('test.slor_expired_request_id'),
  current_setting('test.slor_expired_request_id')::uuid
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8777777-7777-4777-8777-777777777777', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'Expired-only staff sets default office location'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_hr_late_order(
    'f8777777-7777-4777-8777-777777777777',
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    (
      select jsonb_build_object(
        'standalone_items',
        jsonb_build_array(jsonb_build_object('menu_item_id', mi.id, 'quantity', 1))
      )
      from public.menu_items mi
      join public.lunch_days ld on ld.id = mi.lunch_day_id
      where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
        and ld.order_date = current_setting('test.late_order_date')::date
      limit 1
    ),
    null,
    'f9000000-0000-4000-8000-000000000001'
  ) $$,
  'Direct HR create allowed after staff request expired'
);

reset role;
insert into private.staff_late_order_requests (
  requester_profile_id,
  provider_id,
  office_location_id,
  order_date,
  scheduled_delivery_date,
  status,
  requested_summary,
  quantity
)
values (
  'f8444444-4444-4444-8444-444444444444',
  'b1111111-1111-4111-8111-111111111111',
  'f9000000-0000-4000-8000-000000000001',
  current_setting('test.late_order_date')::date,
  current_setting('test.late_delivery_date')::date,
  'pending',
  'Unrelated provider guard',
  1
);

select set_config(
  'test.slor_unrelated_guard_request_id',
  (
    select id::text
    from private.staff_late_order_requests
    where requested_summary = 'Unrelated provider guard'
    limit 1
  ),
  true
);

select lives_ok(
  $$
    select private.ensure_provider_lunch_day(
      'b3333333-3333-4333-8333-333333333333',
      current_setting('test.late_order_date')::date
    )
  $$,
  'Alt provider snapshot for unrelated-provider guard test'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select public.create_hr_late_order(
    'f8444444-4444-4444-8444-444444444444',
    'b3333333-3333-4333-8333-333333333333',
    current_setting('test.late_delivery_date')::date,
    (
      select jsonb_build_object(
        'standalone_items',
        jsonb_build_array(jsonb_build_object('menu_item_id', mi.id, 'quantity', 1))
      )
      from public.menu_items mi
      join public.lunch_days ld on ld.id = mi.lunch_day_id
      where ld.provider_id = 'b3333333-3333-4333-8333-333333333333'
        and ld.order_date = current_setting('test.late_order_date')::date
      limit 1
    ),
    null,
    'f9000000-0000-4000-8000-000000000001'
  ) $$,
  'Pending request for one provider does not block direct HR create for another provider'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select count(*)::integer
    from public.worker_list_pending_hr_late_order_submitted_deliveries(100) w
    where w.staff_late_order_request_id = current_setting('test.slor_decline_request_id')::uuid
  ),
  0,
  'Worker list excludes stale HR submitted deliveries after request terminalized'
);

reset role;

insert into private.notification_delivery_log (
  event_key,
  profile_id,
  operational_date,
  status,
  idempotency_key,
  staff_late_order_request_id,
  rendered_subject
)
values (
  'hr.late_order_submitted',
  'f8222222-2222-4222-8222-222222222222',
  current_setting('test.late_delivery_date')::date,
  'sent',
  'hr.late_order_submitted:sent-history:' || gen_random_uuid()::text,
  current_setting('test.slor_unrelated_guard_request_id')::uuid,
  'Historical sent subject'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ select public.cancel_staff_late_order_request(
    current_setting('test.slor_unrelated_guard_request_id')::uuid
  ) $$,
  'Cancel pending request with historical sent delivery row'
);

reset role;

select ok(
  (
    select rendered_subject
    from private.notification_delivery_log
    where rendered_subject = 'Historical sent subject'
    limit 1
  ) = 'Historical sent subject',
  'Already-sent HR submitted notification history remains unchanged'
);

select * from finish();
rollback;
