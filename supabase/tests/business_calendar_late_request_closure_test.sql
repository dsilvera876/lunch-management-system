begin;

select plan(41);

-- ============================================================
-- Fixtures
--   Locations L1 (ea01) and L2 (ea02); provider ea0p.
--   HR ea11; staff ea21..ea24.
--   Cycle 1: order date O -> delivery D (future business days, no entries).
--   Cycle 2: order date O2 -> delivery D2 (next cycle after D).
-- ============================================================

insert into public.office_locations (id, name, is_active)
values
  ('ea010000-0000-4000-8000-000000000001', 'Closure Office One', true),
  ('ea020000-0000-4000-8000-000000000002', 'Closure Office Two', true)
on conflict (id) do nothing;

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'ea0e0000-0000-4000-8000-00000000000e', 'Closure Late Provider', true, true,
  'delivery_day', '12:00:00', 'manual', 'closure-kitchen@example.com'
)
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ea111111-1111-4111-8111-111111111111', 'closure-hr@test.local', '{"full_name":"Closure HR"}'),
  ('ea211111-1111-4111-8111-111111111111', 'closure-staff-a@test.local', '{"full_name":"Closure StaffA"}'),
  ('ea222222-2222-4222-8222-222222222222', 'closure-staff-b@test.local', '{"full_name":"Closure StaffB"}'),
  ('ea233333-3333-4333-8333-333333333333', 'closure-staff-c@test.local', '{"full_name":"Closure StaffC"}'),
  ('ea244444-4444-4444-8444-444444444444', 'closure-staff-d@test.local', '{"full_name":"Closure StaffD"}');

select private.apply_profile_role('ea111111-1111-4111-8111-111111111111', 'hr');

do $$
declare
  v_order date;
  v_delivery date;
  v_order2 date;
  v_delivery2 date;
begin
  select c.order_date, c.delivery_date
  into v_order, v_delivery
  from (
    select
      (private.jamaica_today_date() + offs) as order_date,
      public.next_business_day(private.jamaica_today_date() + offs) as delivery_date
    from generate_series(7, 60) as offs
  ) c
  where public.is_business_day(c.order_date)
    and public.next_business_day(c.delivery_date) is not null
    and not exists (
      select 1 from private.business_calendar_entries e
      where e.calendar_date between c.order_date and public.next_business_day(public.next_business_day(c.delivery_date))
        and e.archived_at is null
    )
    and not exists (
      select 1 from private.staff_late_order_requests r
      where r.status = 'pending'
        and (r.order_date between c.order_date and public.next_business_day(public.next_business_day(c.delivery_date))
          or r.scheduled_delivery_date between c.order_date and public.next_business_day(public.next_business_day(c.delivery_date)))
    )
  order by c.order_date
  limit 1;

  v_order2 := public.next_business_day(v_delivery);
  v_delivery2 := public.next_business_day(v_order2);

  perform set_config('test.close_order_date', v_order::text, false);
  perform set_config('test.close_delivery_date', v_delivery::text, false);
  perform set_config('test.close_order_date_2', v_order2::text, false);
  perform set_config('test.close_delivery_date_2', v_delivery2::text, false);
end;
$$;

-- Requests on cycle 1: R1/R2 pending at L1, R3 pending at L2,
-- R4 fulfilled, R5 declined (manual), R6 expired.
insert into private.staff_late_order_requests (
  id, requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
  status, requested_summary, decline_reason, declined_at, expired_at, fulfilled_at
)
values
  ('ea900000-0000-4000-8000-000000000001', 'ea211111-1111-4111-8111-111111111111', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea010000-0000-4000-8000-000000000001', current_setting('test.close_order_date')::date,
   current_setting('test.close_delivery_date')::date, 'pending', 'R1 lunch', null, null, null, null),
  ('ea900000-0000-4000-8000-000000000002', 'ea222222-2222-4222-8222-222222222222', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea010000-0000-4000-8000-000000000001', current_setting('test.close_order_date')::date,
   current_setting('test.close_delivery_date')::date, 'pending', 'R2 lunch', null, null, null, null),
  ('ea900000-0000-4000-8000-000000000003', 'ea233333-3333-4333-8333-333333333333', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea020000-0000-4000-8000-000000000002', current_setting('test.close_order_date')::date,
   current_setting('test.close_delivery_date')::date, 'pending', 'R3 lunch', null, null, null, null),
  ('ea900000-0000-4000-8000-000000000004', 'ea244444-4444-4444-8444-444444444444', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea010000-0000-4000-8000-000000000001', current_setting('test.close_order_date')::date,
   current_setting('test.close_delivery_date')::date, 'fulfilled', 'R4 lunch', null, null, null, now()),
  ('ea900000-0000-4000-8000-000000000005', 'ea211111-1111-4111-8111-111111111111', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea010000-0000-4000-8000-000000000001', current_setting('test.close_order_date')::date,
   current_setting('test.close_delivery_date')::date, 'declined', 'R5 lunch', 'Manual HR reason', now(), null, null),
  ('ea900000-0000-4000-8000-000000000006', 'ea233333-3333-4333-8333-333333333333', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea020000-0000-4000-8000-000000000002', current_setting('test.close_order_date')::date,
   current_setting('test.close_delivery_date')::date, 'expired', 'R6 lunch', null, null, now(), null);

-- Requests on cycle 2: R7 pending (closed later via delivery date), R8 pending
-- then fulfilled before that closure.
insert into private.staff_late_order_requests (
  id, requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
  status, requested_summary
)
values
  ('ea900000-0000-4000-8000-000000000007', 'ea233333-3333-4333-8333-333333333333', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea020000-0000-4000-8000-000000000002', current_setting('test.close_order_date_2')::date,
   current_setting('test.close_delivery_date_2')::date, 'pending', 'R7 lunch'),
  ('ea900000-0000-4000-8000-000000000008', 'ea244444-4444-4444-8444-444444444444', 'ea0e0000-0000-4000-8000-00000000000e',
   'ea010000-0000-4000-8000-000000000001', current_setting('test.close_order_date_2')::date,
   current_setting('test.close_delivery_date_2')::date, 'pending', 'R8 lunch');

select private.notify_hr_late_order_submitted('ea900000-0000-4000-8000-000000000001');

create temporary view closure_cycle1_requests as
  select r.id, r.status, r.decline_reason, r.reviewed_by
  from private.staff_late_order_requests r
  where r.id::text like 'ea900000-%';

select ok(
  current_setting('test.close_order_date', true) is not null
  and current_setting('test.close_delivery_date_2', true) is not null,
  'Resolved future business-day cycles without calendar entries'
);

select ok(
  (select count(*) > 0 from private.operational_attention_items o
   where o.staff_late_order_request_id = 'ea900000-0000-4000-8000-000000000001'
     and o.resolved_at is null),
  'Pending request has an unresolved HR bell item before closure'
);

select ok(
  exists (
    select 1 from private.notification_delivery_log d
    where d.staff_late_order_request_id = 'ea900000-0000-4000-8000-000000000001'
      and d.event_key = 'hr.late_order_submitted'
      and d.status = 'pending'
  ),
  'Pending request has an unsent HR submitted email before closure'
);

-- ============================================================
-- Impact preview counts
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  3,
  'Global closure of the order date counts all three pending requests (both locations)'
);

select is(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_delivery_date')::date, 'public_holiday', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  3,
  'Global closure of the delivery date counts the same pending requests'
);

select is(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_order_date')::date, 'company_closure', 'location',
     'ea010000-0000-4000-8000-000000000001'
   ) ->> 'pending_late_request_count')::integer,
  2,
  'Location closure counts only pending requests at that location'
);

select is(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_order_date')::date, 'override_open', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  0,
  'Opening override affects no requests'
);

select ok(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null
   ) ->> 'requires_confirmation')::boolean
  and (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null
   ) ->> 'summary') like '%3 pending late-order request(s) will be automatically declined%',
  'Preview requires confirmation and explains the automatic decline count'
);

reset role;

insert into private.business_calendar_entries (
  id, calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  'ea800000-0000-4000-8000-000000000001', current_setting('test.close_order_date')::date,
  'override_open', 'location', 'ea020000-0000-4000-8000-000000000002', 'Keep L2 open', 'manual'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  2,
  'Location opening override keeps that location''s request out of the global closure count'
);

reset role;
delete from private.business_calendar_entries where id = 'ea800000-0000-4000-8000-000000000001';

-- ============================================================
-- Confirmation required and transaction rollback
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_like(
  $$ select public.upsert_manual_business_calendar_entry(
       null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null,
       'Unconfirmed closure', null, false) $$,
  '%CALENDAR_IMPACT_CONFIRMATION_REQUIRED%',
  'Closure without acknowledgment is rejected'
);

select throws_ok(
  $$
    do $rollback$
    begin
      perform public.upsert_manual_business_calendar_entry(
        null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null,
        'Rolled back closure', null, true);
      raise exception 'forced rollback after closure';
    end;
    $rollback$
  $$,
  'P0001', 'forced rollback after closure',
  'A confirmed closure followed by a failure rolls back'
);

reset role;

select results_eq(
  $$ select status from closure_cycle1_requests
     where id in ('ea900000-0000-4000-8000-000000000001', 'ea900000-0000-4000-8000-000000000002',
                  'ea900000-0000-4000-8000-000000000003')
     order by id $$,
  array['pending', 'pending', 'pending'],
  'Rejected and rolled-back closures leave requests pending'
);

select is(
  (select count(*)::integer from private.business_calendar_entries
   where calendar_date = current_setting('test.close_order_date')::date and archived_at is null),
  0,
  'Rolled-back closure leaves no calendar entry'
);

select is(
  (select count(*)::integer from private.staff_late_order_request_events e
   where e.request_id::text like 'ea900000-%' and e.event_type = 'auto_declined'),
  0,
  'Rolled-back closure leaves no automatic decline audit events'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.staff_late_order_request_id::text like 'ea900000-%'
     and d.event_key = 'staff.late_order_request_declined'),
  0,
  'Rolled-back closure leaves no staff decline emails'
);

select ok(
  (select count(*) > 0 from private.operational_attention_items o
   where o.staff_late_order_request_id = 'ea900000-0000-4000-8000-000000000001'
     and o.resolved_at is null),
  'Rolled-back closure leaves the HR bell item unresolved'
);

-- ============================================================
-- Confirmed closure declines affected pending requests
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null,
       'Company closure', null, true) $$,
  'HR confirms a global closure of the order date'
);

reset role;

select ok(
  exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory'
      and l.pid = pg_backend_pid()
      and l.mode = 'ExclusiveLock'
      and l.granted
      and l.classid::bigint = (private.business_calendar_date_lock_key(current_setting('test.close_order_date')::date) >> 32) & 4294967295
      and l.objid::bigint = private.business_calendar_date_lock_key(current_setting('test.close_order_date')::date) & 4294967295
  ),
  'Closure holds an exclusive calendar-date lock until commit'
);

select results_eq(
  $$ select id::text, status from closure_cycle1_requests
     where id::text between 'ea900000-0000-4000-8000-000000000001' and 'ea900000-0000-4000-8000-000000000006'
     order by id $$,
  $$ values
       ('ea900000-0000-4000-8000-000000000001', 'declined'),
       ('ea900000-0000-4000-8000-000000000002', 'declined'),
       ('ea900000-0000-4000-8000-000000000003', 'declined'),
       ('ea900000-0000-4000-8000-000000000004', 'fulfilled'),
       ('ea900000-0000-4000-8000-000000000005', 'declined'),
       ('ea900000-0000-4000-8000-000000000006', 'expired') $$,
  'Pending requests are declined; fulfilled, declined, and expired requests are preserved'
);

select is(
  (select decline_reason from closure_cycle1_requests where id = 'ea900000-0000-4000-8000-000000000001'),
  format('Lunch ordering is unavailable because the business day (%s) was closed.',
         current_setting('test.close_order_date')),
  'Automatic decline reason explains the business-day closure'
);

select is(
  (select decline_reason from closure_cycle1_requests where id = 'ea900000-0000-4000-8000-000000000005'),
  'Manual HR reason',
  'Previously declined request keeps its manual reason'
);

select is(
  (select reviewed_by from closure_cycle1_requests where id = 'ea900000-0000-4000-8000-000000000002'),
  'ea111111-1111-4111-8111-111111111111'::uuid,
  'Automatic decline records the HR user who closed the day'
);

select results_eq(
  $$ select e.request_id::text, e.event_type, e.actor_profile_id::text,
            e.event_payload ->> 'reason_code', e.event_payload ->> 'calendar_date'
     from private.staff_late_order_request_events e
     where e.request_id::text like 'ea900000-%'
     order by e.request_id $$,
  $$ select v.id, 'auto_declined'::text, 'ea111111-1111-4111-8111-111111111111'::text,
            'business_day_closed'::text, current_setting('test.close_order_date')
     from (values
       ('ea900000-0000-4000-8000-000000000001'),
       ('ea900000-0000-4000-8000-000000000002'),
       ('ea900000-0000-4000-8000-000000000003')) v(id) $$,
  'Audit history records one auto_declined event per affected request, distinct from manual declines'
);

select ok(
  (select e.event_payload ->> 'business_calendar_entry_id'
   from private.staff_late_order_request_events e
   where e.request_id = 'ea900000-0000-4000-8000-000000000001' and e.event_type = 'auto_declined')
  = (select bce.id::text from private.business_calendar_entries bce
     where bce.calendar_date = current_setting('test.close_order_date')::date and bce.archived_at is null),
  'Automatic decline audit links the closing calendar entry'
);

select results_eq(
  $$ select d.profile_id::text, d.status
     from private.notification_delivery_log d
     where d.staff_late_order_request_id::text like 'ea900000-%'
       and d.event_key = 'staff.late_order_request_declined'
     order by d.profile_id $$,
  $$ values
       ('ea211111-1111-4111-8111-111111111111', 'pending'),
       ('ea222222-2222-4222-8222-222222222222', 'pending'),
       ('ea233333-3333-4333-8333-333333333333', 'pending') $$,
  'Each affected employee gets one pending decline email'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select r.decline_reason from public.worker_get_staff_late_order_request_status_context(
     'ea900000-0000-4000-8000-000000000001') r),
  format('Lunch ordering is unavailable because the business day (%s) was closed.',
         current_setting('test.close_order_date')),
  'Decline email context carries the business-closure explanation'
);

reset role;

select is(
  (select count(*)::integer from private.operational_attention_items o
   where o.staff_late_order_request_id in (
     'ea900000-0000-4000-8000-000000000001', 'ea900000-0000-4000-8000-000000000002',
     'ea900000-0000-4000-8000-000000000003')
     and o.resolved_at is null),
  0,
  'HR bell items for automatically declined requests are resolved'
);

select ok(
  (select count(*) > 0 from private.operational_attention_items o
   where o.staff_late_order_request_id = 'ea900000-0000-4000-8000-000000000007'
     and o.resolved_at is null),
  'HR bell items for unaffected pending requests stay open'
);

select ok(
  (select count(*) > 0 and bool_and(d.status = 'skipped')
   from private.notification_delivery_log d
   where d.staff_late_order_request_id = 'ea900000-0000-4000-8000-000000000001'
     and d.event_key = 'hr.late_order_submitted'),
  'Unsent HR submitted emails for an automatically declined request are suppressed'
);

select results_eq(
  $$ select status from closure_cycle1_requests
     where id in ('ea900000-0000-4000-8000-000000000007', 'ea900000-0000-4000-8000-000000000008')
     order by id $$,
  array['pending', 'pending'],
  'Requests on other dates are untouched'
);

-- ============================================================
-- Concurrency outcomes: closure first, then fulfillment
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.fulfill_staff_late_order_request(
       'ea900000-0000-4000-8000-000000000001', '{"standalone_items": []}'::jsonb, null, null) $$,
  'P0001', 'Only pending requests can be fulfilled',
  'Fulfillment after a committed closure sees the automatic decline'
);

select throws_ok(
  $$ select public.decline_staff_late_order_request(
       'ea900000-0000-4000-8000-000000000002', 'Manual decline after closure') $$,
  'P0001', 'Only pending requests can be declined',
  'Manual decline after automatic decline is rejected'
);

-- ============================================================
-- Concurrency outcomes: fulfillment first, then closure (delivery date)
-- ============================================================

reset role;

update private.staff_late_order_requests
set status = 'fulfilled', fulfilled_at = now(), reviewed_by = 'ea111111-1111-4111-8111-111111111111'
where id = 'ea900000-0000-4000-8000-000000000008';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (public.preview_business_calendar_entry_impact(
     null, current_setting('test.close_delivery_date_2')::date, 'public_holiday', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  1,
  'Preview excludes a request that was fulfilled first'
);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       null, current_setting('test.close_delivery_date_2')::date, 'public_holiday', 'global', null,
       'Delivery day holiday', null, true) $$,
  'HR closes the second cycle delivery date'
);

reset role;

select results_eq(
  $$ select id::text, status from closure_cycle1_requests
     where id in ('ea900000-0000-4000-8000-000000000007', 'ea900000-0000-4000-8000-000000000008')
     order by id $$,
  $$ values
       ('ea900000-0000-4000-8000-000000000007', 'declined'),
       ('ea900000-0000-4000-8000-000000000008', 'fulfilled') $$,
  'Delivery-date closure declines the pending request and keeps the already fulfilled one'
);

select is(
  (select count(*)::integer from private.staff_late_order_request_events e
   where e.request_id = 'ea900000-0000-4000-8000-000000000008'),
  0,
  'Already fulfilled request gets no automatic decline audit event'
);

-- ============================================================
-- Repeat closure and non-closure edits do not double-decline or re-notify
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       (select id from public.list_business_calendar_entries(
          extract(year from current_setting('test.close_order_date')::date)::integer, null, null)
        where calendar_date = current_setting('test.close_order_date')::date
          and entry_type = 'company_closure'
        limit 1),
       current_setting('test.close_order_date')::date, 'company_closure', 'global', null,
       'Company closure (renamed)', null, false) $$,
  'Editing the closure name needs no confirmation once requests are already declined'
);

reset role;

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.staff_late_order_request_id::text like 'ea900000-%'
     and d.event_key = 'staff.late_order_request_declined'),
  4,
  'Re-saving a closure sends no additional decline emails'
);

select is(
  (select count(*)::integer from private.staff_late_order_request_events e
   where e.request_id::text like 'ea900000-%' and e.event_type = 'auto_declined'),
  4,
  'Re-saving a closure adds no additional audit events'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ea233333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.preview_business_calendar_entry_impact(
       null, current_setting('test.close_order_date')::date, 'company_closure', 'global', null) $$,
  'P0001', 'Not authorized to preview business calendar impact',
  'Staff cannot preview closure impact'
);

select throws_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       null, current_setting('test.close_order_date_2')::date, 'company_closure', 'global', null,
       'Staff closure', null, true) $$,
  'P0001', 'Not authorized to manage business calendar',
  'Staff cannot close a business day'
);

reset role;

select * from finish();
rollback;
