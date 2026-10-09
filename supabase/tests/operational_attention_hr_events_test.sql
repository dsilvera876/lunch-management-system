begin;

select plan(36);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d1111111-1111-4111-8111-111111111111', 'oa2-hr-one@test.local', '{"full_name":"OA2 HR One"}'),
  ('d1222222-2222-4222-8222-222222222222', 'oa2-hr-two@test.local', '{"full_name":"OA2 HR Two"}'),
  ('d1333333-3333-4333-8333-333333333333', 'oa2-hr-inactive@test.local', '{"full_name":"OA2 HR Inactive"}'),
  ('d1444444-4444-4444-8444-444444444444', 'oa2-admin@test.local', '{"full_name":"OA2 Admin"}');

reset role;
select private.apply_profile_role('d1111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('d1222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('d1333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('d1444444-4444-4444-8444-444444444444', 'admin');

select private.activate_trusted_account_status_change();
update public.profiles set account_status = 'inactive' where id = 'd1333333-3333-4333-8333-333333333333';
select private.deactivate_trusted_account_status_change();

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

-- Signup: one attention row per active HR recipient
set local role anon;
select is(
  (public.request_external_signup('OA2 Applicant', 'oa2-applicant@gmail.com') ->> 'code'),
  'submitted',
  'Signup request submitted'
);
reset role;

select set_config(
  'test.oa2_signup_id',
  (
    select sr.id::text
    from private.signup_requests sr
    where sr.normalized_email = 'oa2-applicant@gmail.com'
    limit 1
  ),
  false
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.pending_signup_approval'
      and o.signup_request_id = current_setting('test.oa2_signup_id')::uuid
      and o.profile_id in (
        'd1111111-1111-4111-8111-111111111111',
        'd1222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Signup creates one operational attention row per active HR recipient'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.pending_signup_approval'
      and o.signup_request_id = current_setting('test.oa2_signup_id')::uuid
      and o.profile_id = 'd1333333-3333-4333-8333-333333333333'
  ),
  0,
  'Inactive HR excluded from signup operational attention'
);

-- Email channel independence (global notification off)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('hr.pending_signup_approval', false, null, null);
reset role;

set local role anon;
select is(
  (public.request_external_signup('OA2 Global Off', 'oa2-global-off@gmail.com') ->> 'code'),
  'submitted',
  'Signup succeeds when email notification globally disabled'
);
reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'hr.pending_signup_approval'
      and exists (
        select 1 from private.signup_requests sr
        where sr.id = d.signup_request_id
          and sr.normalized_email = 'oa2-global-off@gmail.com'
      )
  ),
  0,
  'Email delivery intent skipped when global setting off'
);

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.pending_signup_approval'
      and exists (
        select 1 from private.signup_requests sr
        where sr.id = o.signup_request_id
          and sr.normalized_email = 'oa2-global-off@gmail.com'
      )
  ) >= 2,
  'In-app signup attention still created when email channel disabled'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.update_notification_global_setting('hr.pending_signup_approval', true, null, null);
reset role;

-- Idempotency / concurrency-safe resync
reset role;

select ok(
  private.sync_hr_pending_signup_operational_attention(current_setting('test.oa2_signup_id')::uuid) >= 2,
  'Signup resync touches all eligible HR recipients'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.pending_signup_approval'
      and o.signup_request_id = current_setting('test.oa2_signup_id')::uuid
      and o.profile_id in (
        'd1111111-1111-4111-8111-111111111111',
        'd1222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Idempotent signup sync keeps one row per test HR recipient'
);

-- Recipient isolation (inbox RPC)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  (
    select count(*)::integer
    from public.list_my_operational_attention_items()
    where signup_request_id = current_setting('test.oa2_signup_id')::uuid
  ) >= 1,
  'HR recipient sees own signup attention in inbox RPC'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (
    select count(*)::integer
    from public.list_my_operational_attention_items()
    where signup_request_id = current_setting('test.oa2_signup_id')::uuid
  ),
  1,
  'Second HR inbox lists only own signup attention row'
);

reset role;

-- Signup resolution: reject
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.reject_signup_request(current_setting('test.oa2_signup_id')::uuid, 'Not eligible') $$,
  'HR rejects signup request'
);

reset role;

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.signup_request_id = current_setting('test.oa2_signup_id')::uuid
      and o.resolved_at is null
  ) = 0,
  'Reject resolves all signup operational attention rows'
);

-- Signup resolution: approve (new pending request)
set local role anon;
select is(
  (public.request_external_signup('OA2 Approve Me', 'oa2-approve@gmail.com') ->> 'code'),
  'submitted',
  'Second signup for approve path'
);
reset role;

select set_config(
  'test.oa2_signup_approve_id',
  (
    select sr.id::text
    from private.signup_requests sr
    where sr.normalized_email = 'oa2-approve@gmail.com'
    limit 1
  ),
  false
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select count(*) from public.mark_signup_request_approved(current_setting('test.oa2_signup_approve_id')::uuid, null) $$,
  'HR approves signup request'
);

reset role;

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.signup_request_id = current_setting('test.oa2_signup_approve_id')::uuid
      and o.resolved_at is null
  ) = 0,
  'Approve resolves signup operational attention rows'
);

-- Signup resolution: cancel pending
set local role anon;
select is(
  (public.request_external_signup('OA2 Cancel Me', 'oa2-cancel@gmail.com') ->> 'code'),
  'submitted',
  'Third signup for cancel path'
);
reset role;

select set_config(
  'test.oa2_signup_cancel_id',
  (
    select sr.id::text
    from private.signup_requests sr
    where sr.normalized_email = 'oa2-cancel@gmail.com'
    limit 1
  ),
  false
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (
    select success
    from public.cancel_signup_request(
      current_setting('test.oa2_signup_cancel_id')::uuid,
      'duplicate_request',
      null
    )
    limit 1
  ),
  true,
  'HR cancels pending signup request'
);

reset role;

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.signup_request_id = current_setting('test.oa2_signup_cancel_id')::uuid
      and o.resolved_at is null
  ) = 0,
  'Cancel resolves signup operational attention rows'
);

-- Late-order path (minimal SLOR setup)
\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'd2111111-1111-4111-8111-111111111111',
  'OA2 Late Provider',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'oa2-kitchen@example.com'
)
on conflict (id) do update set active = true, accepts_late_orders = true;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values (
  'd3111111-1111-4111-8111-111111111111',
  'd2111111-1111-4111-8111-111111111111',
  'OA2 Main',
  10.00,
  'standalone',
  'Each',
  true
)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'd3111111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d8111111-1111-4111-8111-111111111111', 'oa2-slor-staff@test.local', '{"full_name":"OA2 SLOR Staff"}')
on conflict (id) do nothing;

reset role;
select private.apply_profile_role('d8111111-1111-4111-8111-111111111111', 'staff');

insert into public.office_locations (id, name, is_active)
values ('d9000000-0000-4000-8000-000000000001', 'OA2 Office', true)
on conflict (id) do nothing;

select lives_ok(
  $$
    select private.ensure_provider_lunch_day(
      'd2111111-1111-4111-8111-111111111111',
      current_setting('test.late_order_date')::date
    )
  $$,
  'Late order snapshot ready'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_default_office_location('d9000000-0000-4000-8000-000000000001') $$,
  'Staff default office for late order'
);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'd2111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'OA2 late order summary',
    1,
    null
  ) $$,
  'Staff submits late order request'
);

reset role;

select set_config(
  'test.oa2_late_request_id',
  (
    select r.id::text
    from private.staff_late_order_requests r
    where r.requester_profile_id = 'd8111111-1111-4111-8111-111111111111'
      and r.status = 'pending'
    order by r.created_at desc
    limit 1
  ),
  false
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.late_order_submitted'
      and o.staff_late_order_request_id = current_setting('test.oa2_late_request_id')::uuid
      and o.profile_id in (
        'd1111111-1111-4111-8111-111111111111',
        'd1222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Late order submission creates operational attention for each active HR'
);

select ok(
  private.sync_hr_late_order_submitted_operational_attention(
    current_setting('test.oa2_late_request_id')::uuid
  ) >= 2,
  'Late order resync is idempotent for eligible HR recipients'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.late_order_submitted'
      and o.staff_late_order_request_id = current_setting('test.oa2_late_request_id')::uuid
      and o.profile_id in (
        'd1111111-1111-4111-8111-111111111111',
        'd1222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Late order keeps one operational row per test HR recipient'
);

-- Decline resolution
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.decline_staff_late_order_request(
    current_setting('test.oa2_late_request_id')::uuid,
    'Cannot fulfill'
  ) $$,
  'HR declines late order request'
);

reset role;

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.staff_late_order_request_id = current_setting('test.oa2_late_request_id')::uuid
      and o.resolved_at is null
  ) = 0,
  'Decline resolves late-order operational attention rows'
);

-- Fulfill + expire paths on a second request
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select set_config(
  'test.oa2_late_fulfill_id',
  public.create_staff_late_order_request(
    'd2111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'OA2 fulfill path',
    1,
    null
  )::text,
  false
);

reset role;

-- Backfill helper: idempotent, pending work only, active HR only
select ok(
  (private.backfill_hr_operational_attention_pending_work() ->> 'pending_signup_requests')::integer >= 0,
  'Backfill runs without error'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.staff_late_order_request_id = current_setting('test.oa2_late_fulfill_id')::uuid
      and o.resolved_at is null
      and o.profile_id in (
        'd1111111-1111-4111-8111-111111111111',
        'd1222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Backfill baseline row count for pending late-order request'
);

select private.backfill_hr_operational_attention_pending_work();

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.staff_late_order_request_id = current_setting('test.oa2_late_fulfill_id')::uuid
      and o.resolved_at is null
      and o.profile_id in (
        'd1111111-1111-4111-8111-111111111111',
        'd1222222-2222-4222-8222-222222222222'
      )
  ),
  2,
  'Second backfill pass does not duplicate operational attention rows'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.event_key = 'hr.pending_signup_approval'
      and o.profile_id = 'd1333333-3333-4333-8333-333333333333'
  ),
  0,
  'Backfill never creates rows for inactive HR recipients'
);

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.staff_late_order_request_id = current_setting('test.oa2_late_fulfill_id')::uuid
      and o.resolved_at is null
  ) >= 2,
  'Pending late-order request has active attention before fulfillment'
);

-- Email still queued independently (regression)
select ok(
  exists (
    select 1
    from private.notification_delivery_log d
    where d.event_key = 'hr.late_order_submitted'
      and d.staff_late_order_request_id = current_setting('test.oa2_late_fulfill_id')::uuid
  ),
  'Email notification delivery intent still created for late order'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  (
    select public.fulfill_staff_late_order_request(
      current_setting('test.oa2_late_fulfill_id')::uuid,
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
        where ld.provider_id = 'd2111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.late_order_date')::date
        order by mi.name
        limit 1
      ),
      'HR fulfilled OA2 test',
      'd9000000-0000-4000-8000-000000000001'
    )
  ) is not null,
  'HR fulfills late order request'
);

reset role;

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.staff_late_order_request_id = current_setting('test.oa2_late_fulfill_id')::uuid
      and o.resolved_at is null
  ) = 0,
  'Fulfill resolves late-order operational attention rows'
);

-- Expire path via status transition (same trigger as worker expiry)
insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'd2122222-2222-4222-8222-222222222222',
  'OA2 Late Provider B',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'oa2-kitchen-b@example.com'
)
on conflict (id) do update set active = true, accepts_late_orders = true;

select lives_ok(
  $$
    select private.ensure_provider_lunch_day(
      'd2122222-2222-4222-8222-222222222222',
      current_setting('test.late_order_date')::date
    )
  $$,
  'Second provider lunch day for expire path'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select set_config(
  'test.oa2_late_expire_id',
  public.create_staff_late_order_request(
    'd2122222-2222-4222-8222-222222222222',
    current_setting('test.late_delivery_date')::date,
    'OA2 expire path',
    1,
    null
  )::text,
  false
);

reset role;

update private.staff_late_order_requests
set status = 'expired', expired_at = now()
where id = current_setting('test.oa2_late_expire_id')::uuid
  and status = 'pending';

select ok(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.staff_late_order_request_id = current_setting('test.oa2_late_expire_id')::uuid
      and o.resolved_at is null
  ) = 0,
  'Expire status transition resolves late-order operational attention rows'
);

select * from finish();
rollback;
