begin;

select plan(63);

-- ============================================================
-- Fixtures
--   Jamaica "today" is pinned to Monday 2026-10-12. Official 2026 holidays used:
--   National Heroes' Day Mon 2026-10-19, Christmas Fri 2026-12-25, Boxing Day
--   Sat 2026-12-26. Manual entries after today are cleared so dates are fixed.
--   Locations L1 (ee01), L2 (ee02); provider ee0e; HR ee11; staff ee2000NN.
-- ============================================================

\ir support/pgtap_test_session.inc
select set_config('test.jamaica_today', '2026-10-12', false);

delete from private.business_calendar_entries
where source = 'manual' and calendar_date >= '2026-10-12';

insert into public.office_locations (id, name, is_active)
values
  ('ee010000-0000-4000-8000-000000000001', 'Calendar Change Office One', true),
  ('ee020000-0000-4000-8000-000000000002', 'Calendar Change Office Two', true)
on conflict (id) do nothing;

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'ee0e0000-0000-4000-8000-00000000000e', 'Calendar Change Provider', true, true,
  'delivery_day', '12:00:00', 'manual', 'calendar-change-kitchen@example.com'
)
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data)
select
  format('ee2000%s-0000-4000-8000-000000000000', lpad(n::text, 2, '0'))::uuid,
  format('calendar-change-staff-%s@test.local', n),
  jsonb_build_object('full_name', format('Calendar Staff %s', n))
from generate_series(1, 16) as n;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ee111111-1111-4111-8111-111111111111', 'calendar-change-hr@test.local', '{"full_name":"Calendar HR"}');

select private.apply_profile_role('ee111111-1111-4111-8111-111111111111', 'hr');

create temporary table cc_request_specs (
  n integer primary key,
  location_id uuid not null,
  order_date date not null,
  delivery_date date not null,
  status text not null default 'pending'
);

insert into cc_request_specs (n, location_id, order_date, delivery_date, status)
values
  -- Archive of a global override-open on Heroes' Day.
  (1,  'ee010000-0000-4000-8000-000000000001', '2026-10-16', '2026-10-19', 'pending'),
  (2,  'ee020000-0000-4000-8000-000000000002', '2026-10-19', '2026-10-20', 'pending'),
  (3,  'ee010000-0000-4000-8000-000000000001', '2026-10-16', '2026-10-19', 'fulfilled'),
  -- Reopening Saturday 2026-10-17 changes the Fri 16 cycle; Tue 20 cycle unaffected.
  (4,  'ee010000-0000-4000-8000-000000000001', '2026-10-16', '2026-10-20', 'pending'),
  (5,  'ee010000-0000-4000-8000-000000000001', '2026-10-20', '2026-10-21', 'pending'),
  -- Moving that override to Saturday 2026-10-24.
  (6,  'ee010000-0000-4000-8000-000000000001', '2026-10-17', '2026-10-20', 'pending'),
  (7,  'ee020000-0000-4000-8000-000000000002', '2026-10-23', '2026-10-26', 'pending'),
  -- Location override on a global closure (Wed 2026-11-04), then relocated / rescoped.
  (8,  'ee010000-0000-4000-8000-000000000001', '2026-11-04', '2026-11-05', 'pending'),
  -- Location override archived while a global override keeps Sat 2026-11-14 open.
  (9,  'ee020000-0000-4000-8000-000000000002', '2026-11-14', '2026-11-16', 'pending'),
  -- Official holiday seeding re-closes Christmas.
  (10, 'ee010000-0000-4000-8000-000000000001', '2026-12-24', '2026-12-25', 'pending'),
  (11, 'ee020000-0000-4000-8000-000000000002', '2026-12-24', '2026-12-25', 'expired'),
  -- Silently invalidated by a direct calendar write; fulfillment must refuse it.
  (12, 'ee010000-0000-4000-8000-000000000001', '2026-10-30', '2026-11-02', 'pending'),
  -- Rollback probe on Heroes' Day.
  (13, 'ee020000-0000-4000-8000-000000000002', '2026-10-16', '2026-10-19', 'declined');

create temporary view cc_requests as
select s.n, r.*
from cc_request_specs s
join private.staff_late_order_requests r
  on r.id = format('ee9000%s-0000-4000-8000-000000000000', lpad(s.n::text, 2, '0'))::uuid;

create or replace function pg_temp.cc_request_id(p_n integer)
returns uuid
language sql
immutable
as $$ select format('ee9000%s-0000-4000-8000-000000000000', lpad(p_n::text, 2, '0'))::uuid $$;

create or replace function pg_temp.cc_set_hr()
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', 'ee111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
    true
  );
$$;

-- Heroes' Day open via a manual global override; Sat 2026-11-14 open globally
-- and at L2; Wed 2026-11-04 globally closed with an L1 override-open.
insert into private.business_calendar_entries (id, calendar_date, entry_type, scope, office_location_id, name, source)
values
  ('ee800000-0000-4000-8000-000000000001', '2026-10-19', 'override_open', 'global', null, 'Open on Heroes Day', 'manual'),
  ('ee800000-0000-4000-8000-000000000002', '2026-11-04', 'company_closure', 'global', null, 'Company retreat', 'manual'),
  ('ee800000-0000-4000-8000-000000000003', '2026-11-04', 'override_open', 'location', 'ee010000-0000-4000-8000-000000000001', 'L1 stays open', 'manual'),
  ('ee800000-0000-4000-8000-000000000004', '2026-11-14', 'override_open', 'global', null, 'Saturday service', 'manual'),
  ('ee800000-0000-4000-8000-000000000005', '2026-11-14', 'override_open', 'location', 'ee020000-0000-4000-8000-000000000002', 'L2 Saturday', 'manual');

-- Christmas is missing from the official calendar (e.g. skipped at the original seed).
delete from private.business_calendar_entries
where source = 'official' and calendar_date = '2026-12-25';

insert into private.staff_late_order_requests (
  id, requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
  status, requested_summary, declined_at, decline_reason, expired_at, fulfilled_at
)
select
  pg_temp.cc_request_id(s.n),
  format('ee2000%s-0000-4000-8000-000000000000', lpad(s.n::text, 2, '0'))::uuid,
  'ee0e0000-0000-4000-8000-00000000000e',
  s.location_id,
  s.order_date,
  s.delivery_date,
  s.status,
  format('Request %s', s.n),
  case when s.status = 'declined' then now() end,
  case when s.status = 'declined' then 'Manual HR reason' end,
  case when s.status = 'expired' then now() end,
  case when s.status = 'fulfilled' then now() end
from cc_request_specs s;

select private.notify_hr_late_order_submitted(pg_temp.cc_request_id(1));

select ok(
  (select bool_and(private.staff_late_order_request_calendar_issue(order_date, scheduled_delivery_date, office_location_id) is null)
   from cc_requests where n in (1, 2, 5, 7, 8, 9, 10, 12)),
  'Pending fixture requests start with a valid calendar cycle'
);

select ok(
  private.staff_late_order_request_calendar_issue('2026-10-16', '2026-10-20', 'ee010000-0000-4000-8000-000000000001')
    = 'delivery_cycle_changed',
  'Request 4 is not yet valid while Heroes'' Day is open (Fri 16 delivers on Mon 19)'
);

-- ============================================================
-- Archiving an override-open (Heroes' Day)
-- ============================================================

set local role authenticated;
select pg_temp.cc_set_hr();

select is(
  (public.preview_business_calendar_archive_impact('ee800000-0000-4000-8000-000000000001')
     ->> 'pending_late_request_count')::integer,
  2,
  'Archive preview counts the two pending requests on Heroes'' Day'
);

select is(
  (public.preview_business_calendar_archive_impact('ee800000-0000-4000-8000-000000000001')
     ->> 'requires_confirmation')::boolean,
  true,
  'Archive preview requires confirmation'
);

select throws_like(
  $$ select public.archive_business_calendar_entry('ee800000-0000-4000-8000-000000000001') $$,
  'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: 2 pending late-order request(s)%',
  'Archive without confirmation is rejected'
);

reset role;

select results_eq(
  $$ select n, status from cc_requests where n in (1, 2) order by n $$,
  $$ values (1, 'pending'), (2, 'pending') $$,
  'Rejected archive leaves both requests pending'
);

select is(
  (select archived_at from private.business_calendar_entries where id = 'ee800000-0000-4000-8000-000000000001'),
  null,
  'Rejected archive leaves the override active'
);

do $$
begin
  perform public.archive_business_calendar_entry('ee800000-0000-4000-8000-000000000001', true);
  raise exception 'force rollback' using errcode = 'P0R01';
exception
  when sqlstate 'P0R01' then null;
end;
$$;

select ok(
  (select count(*) = 0 from private.staff_late_order_request_events e
   where e.request_id in (pg_temp.cc_request_id(1), pg_temp.cc_request_id(2)))
  and (select status = 'pending' from cc_requests where n = 1)
  and (select archived_at is null from private.business_calendar_entries where id = 'ee800000-0000-4000-8000-000000000001'),
  'A failed archive transaction rolls back the archive, declines and audit events'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select lives_ok(
  $$ select public.archive_business_calendar_entry('ee800000-0000-4000-8000-000000000001', true) $$,
  'HR archives the override-open with confirmation'
);

reset role;

select results_eq(
  $$ select n, status from cc_requests where n in (1, 2, 3, 13) order by n $$,
  $$ values (1, 'declined'), (2, 'declined'), (3, 'fulfilled'), (13, 'declined') $$,
  'Archive declines the invalidated pending requests and preserves fulfilled/declined ones'
);

select is(
  (select decline_reason from cc_requests where n = 1),
  'Lunch ordering is unavailable because the business day (2026-10-19) was closed.',
  'Delivery-day closure reason names the closed day'
);

select is(
  (select decline_reason from cc_requests where n = 13),
  'Manual HR reason',
  'Existing manual decline is untouched'
);

select results_eq(
  $$ select e.event_payload ->> 'reason_code', e.event_payload ->> 'initiated_by',
            e.event_payload ->> 'business_calendar_entry_id', e.actor_profile_id
     from private.staff_late_order_request_events e
     where e.request_id = pg_temp.cc_request_id(1) and e.event_type = 'auto_declined' $$,
  $$ values ('business_day_closed'::text, 'hr_calendar_archive'::text,
             'ee800000-0000-4000-8000-000000000001'::text, 'ee111111-1111-4111-8111-111111111111'::uuid) $$,
  'Archive decline is audited with reason code, initiator, calendar entry and HR actor'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.staff_late_order_request_id in (pg_temp.cc_request_id(1), pg_temp.cc_request_id(2))
     and d.event_key = 'staff.late_order_request_declined'),
  2,
  'Each affected employee is emailed once'
);

select ok(
  not exists (
    select 1 from private.operational_attention_items o
    where o.staff_late_order_request_id = pg_temp.cc_request_id(1) and o.resolved_at is null
  ),
  'HR bell item for the declined request is resolved'
);

select is(
  (select count(*)::integer from private.business_calendar_entry_audit a
   where a.entry_id = 'ee800000-0000-4000-8000-000000000001' and a.action = 'archive'),
  1,
  'Calendar archive audit row is preserved'
);

select is(
  (select count(*)::integer from private.staff_late_order_request_events e
   where e.request_id in (pg_temp.cc_request_id(3), pg_temp.cc_request_id(13))),
  0,
  'Fulfilled and previously declined requests get no automatic audit events'
);

-- ============================================================
-- Reopening a day changes a delivery cycle (Sat 2026-10-17)
-- ============================================================

select is(
  (select status from cc_requests where n = 4),
  'pending',
  'Request 4 became valid when Heroes'' Day closed again and was not declined'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select is(
  (public.preview_business_calendar_entry_impact(null, '2026-10-17', 'override_open', 'global', null)
     ->> 'pending_late_request_count')::integer,
  1,
  'Override-open preview counts the request whose delivery cycle would change'
);

select throws_like(
  $$ select public.upsert_manual_business_calendar_entry(null, '2026-10-17', 'override_open', 'global', null, 'Saturday opening', null, false) $$,
  'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: 1 pending late-order request(s)%',
  'Reopening without confirmation is rejected'
);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(null, '2026-10-17', 'override_open', 'global', null, 'Saturday opening', null, true) $$,
  'HR reopens Saturday with confirmation'
);

reset role;

select results_eq(
  $$ select n, status from cc_requests where n in (4, 5) order by n $$,
  $$ values (4, 'declined'), (5, 'pending') $$,
  'Only the request whose cycle changed is declined'
);

select is(
  (select decline_reason from cc_requests where n = 4),
  'The business calendar changed, so the originally requested delivery schedule (order date 2026-10-16, delivery date 2026-10-20) is no longer available.',
  'Cycle-change decline explains the schedule is no longer available'
);

select is(
  (select e.event_payload ->> 'reason_code' from private.staff_late_order_request_events e
   where e.request_id = pg_temp.cc_request_id(4) and e.event_type = 'auto_declined'),
  'delivery_cycle_changed',
  'Cycle-change decline is audited with its own reason code'
);

select is(
  (select scheduled_delivery_date from cc_requests where n = 4),
  '2026-10-20'::date,
  'The declined request is not rescheduled'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.staff_late_order_request_id = pg_temp.cc_request_id(4)
     and d.event_key = 'staff.late_order_request_declined'),
  1,
  'Employee is emailed about the changed delivery cycle'
);

-- ============================================================
-- Moving the override to Sat 2026-10-24
-- ============================================================

select is(
  private.staff_late_order_request_calendar_issue('2026-10-17', '2026-10-20', 'ee010000-0000-4000-8000-000000000001'),
  null,
  'Request 6 (Saturday order) is valid while Saturday is open'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select set_config(
  'test.cc_saturday_entry',
  (select e.id::text from public.list_business_calendar_entries(2026, null, null) e
   where e.calendar_date = '2026-10-17' and e.entry_type = 'override_open'),
  true
);

select is(
  (public.preview_business_calendar_entry_impact(
     current_setting('test.cc_saturday_entry')::uuid, '2026-10-24', 'override_open', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  2,
  'Edit preview counts requests on both the old and new override dates'
);

select throws_like(
  $$ select public.upsert_manual_business_calendar_entry(
       current_setting('test.cc_saturday_entry')::uuid, '2026-10-24', 'override_open', 'global', null, 'Saturday opening', null, false) $$,
  'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: 2 pending late-order request(s)%',
  'Moving the override without confirmation is rejected'
);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       current_setting('test.cc_saturday_entry')::uuid, '2026-10-24', 'override_open', 'global', null, 'Saturday opening', null, true) $$,
  'HR moves the override with confirmation'
);

reset role;

select results_eq(
  $$ select n, status, (select e.event_payload ->> 'reason_code' from private.staff_late_order_request_events e
                        where e.request_id = r.id and e.event_type = 'auto_declined')
     from cc_requests r where n in (6, 7) order by n $$,
  $$ values (6, 'declined', 'business_day_closed'), (7, 'declined', 'delivery_cycle_changed') $$,
  'Moving the override closes the old Saturday and changes the new Saturday''s cycle'
);

select ok(
  (select e.event_payload -> 'calendar_dates' = '["2026-10-17", "2026-10-24"]'::jsonb
     and e.event_payload ->> 'initiated_by' = 'hr_calendar_change'
   from private.staff_late_order_request_events e
   where e.request_id = pg_temp.cc_request_id(6) and e.event_type = 'auto_declined'),
  'Edit decline records both changed dates and the HR calendar-change initiator'
);

select is(
  (select count(*)::integer from private.business_calendar_entry_audit a
   where a.entry_id = current_setting('test.cc_saturday_entry')::uuid and a.action = 'update'),
  1,
  'Calendar update audit row is recorded for the move'
);

-- ============================================================
-- Location precedence: relocating and rescoping an override (Wed 2026-11-04)
-- ============================================================

select ok(
  public.is_business_day('2026-11-04', 'ee010000-0000-4000-8000-000000000001')
  and not public.is_business_day('2026-11-04', 'ee020000-0000-4000-8000-000000000002'),
  'L1 override-open beats the global closure; L2 is closed'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select is(
  (public.preview_business_calendar_entry_impact(
     'ee800000-0000-4000-8000-000000000003', '2026-11-04', 'override_open', 'location',
     'ee020000-0000-4000-8000-000000000002'
   ) ->> 'pending_late_request_count')::integer,
  1,
  'Relocation preview counts the L1 request that loses its override'
);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       'ee800000-0000-4000-8000-000000000003', '2026-11-04', 'override_open', 'location',
       'ee020000-0000-4000-8000-000000000002', 'L2 stays open', null, true) $$,
  'HR moves the location override from L1 to L2'
);

reset role;

select is(
  (select status from cc_requests where n = 8),
  'declined',
  'L1 request is declined once L1 falls back to the global closure'
);

select is(
  (select decline_reason from cc_requests where n = 8),
  'Lunch ordering is unavailable because the business day (2026-11-04) was closed.',
  'Relocation decline names the closed order day'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select is(
  (public.preview_business_calendar_entry_impact(
     'ee800000-0000-4000-8000-000000000003', '2026-11-04', 'override_open', 'global', null
   ) ->> 'pending_late_request_count')::integer,
  0,
  'Rescoping the override to global opens both locations and invalidates nothing'
);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
       'ee800000-0000-4000-8000-000000000003', '2026-11-04', 'override_open', 'global',
       null, 'Everyone stays open', null, false) $$,
  'Rescoping to global needs no late-request confirmation'
);

reset role;

select ok(
  public.is_business_day('2026-11-04', 'ee010000-0000-4000-8000-000000000001')
  and public.is_business_day('2026-11-04', 'ee020000-0000-4000-8000-000000000002'),
  'Global override-open now opens both locations'
);

-- ============================================================
-- Archiving a location override that a global override still covers (Sat 2026-11-14)
-- ============================================================

set local role authenticated;
select pg_temp.cc_set_hr();

select is(
  (public.preview_business_calendar_archive_impact('ee800000-0000-4000-8000-000000000005')
     ->> 'pending_late_request_count')::integer,
  0,
  'Archive preview is zero when the global override keeps the day open'
);

select lives_ok(
  $$ select public.archive_business_calendar_entry('ee800000-0000-4000-8000-000000000005') $$,
  'Archiving the redundant location override needs no confirmation'
);

reset role;

select is(
  (select status from cc_requests where n = 9),
  'pending',
  'A request that remains valid is not declined'
);

-- ============================================================
-- Official holiday seeding (system and HR initiated)
-- ============================================================

select ok(
  public.is_business_day('2026-12-25', 'ee010000-0000-4000-8000-000000000001'),
  'Christmas is open while its official row is missing'
);

select set_config('request.jwt.claims', '', true);

select is(
  private.seed_jamaica_official_public_holidays_2026(),
  1,
  'System seeding re-inserts the missing Christmas holiday'
);

select results_eq(
  $$ select n, status, reviewed_by from cc_requests where n in (10, 11) order by n $$,
  $$ values (10, 'declined', null::uuid), (11, 'expired', null::uuid) $$,
  'Seeding declines the pending Christmas request and preserves the expired one'
);

select results_eq(
  $$ select e.event_payload ->> 'reason_code', e.event_payload ->> 'initiated_by', e.actor_profile_id
     from private.staff_late_order_request_events e
     where e.request_id = pg_temp.cc_request_id(10) and e.event_type = 'auto_declined' $$,
  $$ values ('business_day_closed'::text, 'official_holiday_seed'::text, null::uuid) $$,
  'System-initiated seed decline is audited without an actor'
);

select ok(
  (select e.event_payload ->> 'business_calendar_entry_id' = bce.id::text
   from private.staff_late_order_request_events e
   cross join private.business_calendar_entries bce
   where e.request_id = pg_temp.cc_request_id(10) and e.event_type = 'auto_declined'
     and bce.source = 'official' and bce.calendar_date = '2026-12-25' and bce.archived_at is null),
  'Seed decline references the inserted official holiday'
);

select results_eq(
  $$ select a.action, a.changed_by, a.new_record ->> 'source'
     from private.business_calendar_entry_audit a
     join private.business_calendar_entries bce on bce.id = a.entry_id
     where bce.source = 'official' and bce.calendar_date = '2026-12-25' $$,
  $$ values ('insert'::text, null::uuid, 'official'::text) $$,
  'Seeded official holiday is recorded in the calendar audit as a system insert'
);

select is(
  (select count(*)::integer from private.notification_delivery_log d
   where d.staff_late_order_request_id = pg_temp.cc_request_id(10)
     and d.event_key = 'staff.late_order_request_declined'),
  1,
  'Employee is emailed about the seeded holiday closure'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select is(
  public.seed_official_business_calendar_year(2026),
  0,
  'HR re-seeding is idempotent once all official holidays exist'
);

reset role;

select is(
  (select count(*)::integer from private.staff_late_order_request_events e
   where e.request_id = pg_temp.cc_request_id(10)),
  1,
  'Idempotent re-seed adds no further audit events'
);

-- ============================================================
-- Fulfillment refuses a request whose cycle changed underneath it
-- ============================================================

insert into private.business_calendar_entries (calendar_date, entry_type, scope, office_location_id, name, source)
values ('2026-10-31', 'override_open', 'global', null, 'Direct write', 'manual');

select is(
  private.staff_late_order_request_calendar_issue('2026-10-30', '2026-11-02', 'ee010000-0000-4000-8000-000000000001'),
  'delivery_cycle_changed',
  'A direct calendar write changes request 12''s cycle'
);

set local role authenticated;
select pg_temp.cc_set_hr();

select throws_ok(
  $$ select public.fulfill_staff_late_order_request(
       pg_temp.cc_request_id(12), '{"standalone_items": []}'::jsonb, null, null) $$,
  'The business calendar changed and this request''s delivery schedule is no longer available',
  'Fulfillment never reschedules a request onto a changed cycle'
);

reset role;

select is(
  (select status from cc_requests where n = 12),
  'pending',
  'Refused fulfillment leaves the request untouched'
);

-- ============================================================
-- Locks and permissions
-- ============================================================

set local role authenticated;
select pg_temp.cc_set_hr();

select lives_ok(
  $$ select public.archive_business_calendar_entry('ee800000-0000-4000-8000-000000000004', true) $$,
  'HR archives the Saturday global override'
);

reset role;

select ok(
  exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.mode = 'ExclusiveLock' and l.pid = pg_backend_pid() and l.granted
      and ((l.classid::bigint << 32) | l.objid::bigint) = private.business_calendar_date_lock_key('2026-11-14')
  ),
  'Archive holds an exclusive calendar-date lock on the archived date'
);

select ok(
  exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.mode = 'ExclusiveLock' and l.pid = pg_backend_pid() and l.granted
      and ((l.classid::bigint << 32) | l.objid::bigint) = private.business_calendar_date_lock_key('2026-12-25')
  ),
  'Seeding holds exclusive calendar-date locks on the holiday dates'
);

select is(
  (select status from cc_requests where n = 9),
  'declined',
  'Archiving the last override on Saturday declines the remaining request'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'ee200001-0000-4000-8000-000000000000', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.preview_business_calendar_archive_impact('ee800000-0000-4000-8000-000000000002') $$,
  'Not authorized to preview business calendar impact',
  'Staff cannot preview archive impact'
);

select throws_ok(
  $$ select public.archive_business_calendar_entry('ee800000-0000-4000-8000-000000000002', true) $$,
  'Not authorized to manage business calendar',
  'Staff cannot archive calendar entries'
);

select throws_ok(
  $$ select public.seed_official_business_calendar_year(2026) $$,
  'Not authorized to seed business calendar',
  'Staff cannot seed official holidays'
);

reset role;

select * from finish();
rollback;
