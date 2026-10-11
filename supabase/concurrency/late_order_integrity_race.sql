-- Deterministic two-session race checks for late-order calendar locks (closure
-- and override archive versus request creation) and staff order notification
-- idempotency. LOCAL DEVELOPMENT DATABASES ONLY: fixtures are committed
-- through dblink sessions and removed again at the start and end of the run.
-- The script quits before touching data unless it is connected through the
-- local container socket to a database seeded with the local fixtures below.
--
-- Run (local Supabase):
--   Get-Content supabase/concurrency/late_order_integrity_race.sql |
--     docker exec -i supabase_db_lunch-management-system psql -U postgres -v ON_ERROR_STOP=1
--
-- Each scenario starts the first transaction, sends the competing call from a
-- second session, waits until that session is blocked on a lock held by the
-- first, then commits the first and checks the outcome.
--
-- dblink requires password authentication for non-superusers, so the default
-- connection goes through the container's network address (SCRAM), not loopback.
-- Uses seed accounts (staff1, staff2, hr) and seed order 60000001-...; override
-- the connection string with -v race_conninfo='...'.

\if :{?race_conninfo}
\else
\set race_conninfo 'host=supabase_db_lunch-management-system port=5432 user=postgres password=postgres dbname=postgres'
\endif

set client_min_messages = notice;

-- Development guard: only run through the local container socket (docker exec)
-- against a database that carries the local seed accounts and seed order.
select (
  inet_server_addr() is null
  and (select count(*) from public.profiles p where p.id in (
    '10000002-0002-4002-8002-000000000002',
    '10000004-0004-4004-8004-000000000004',
    '10000005-0005-4005-8005-000000000005'
  )) = 3
  and exists (select 1 from public.orders o where o.id = '60000001-0001-4001-8001-000000000001')
) as race_local_dev \gset

\if :race_local_dev
\else
\echo 'Refusing to run: late_order_integrity_race.sql is restricted to the seeded local development database (run via docker exec ... psql).'
\quit
\endif

select not exists (select 1 from pg_extension where extname = 'dblink') as race_created_dblink \gset
create extension if not exists dblink with schema extensions;

select set_config('race.conninfo', :'race_conninfo', false);
select set_config('race.provider_id', 'ee111111-1111-4111-8111-111111111111', false);
select set_config('race.staff1', '10000004-0004-4004-8004-000000000004', false);
select set_config('race.staff2', '10000005-0005-4005-8005-000000000005', false);
select set_config('race.hr', '10000002-0002-4002-8002-000000000002', false);
select set_config('race.order_id', '60000001-0001-4001-8001-000000000001', false);
select set_config('race.started_at', clock_timestamp()::text, false);

create or replace function pg_temp.race_connect(p_name text, p_profile uuid)
returns integer
language plpgsql
as $$
declare
  v_pid integer;
begin
  if p_name = any (coalesce(extensions.dblink_get_connections(), '{}')) then
    perform extensions.dblink_disconnect(p_name);
  end if;
  perform extensions.dblink_connect(
    p_name,
    current_setting('race.conninfo') || ' application_name=' || p_name
  );
  select pid into v_pid from extensions.dblink(p_name, 'select pg_backend_pid()') as t(pid integer);
  perform extensions.dblink_exec(p_name, 'begin');
  if p_profile is not null then
    perform extensions.dblink_exec(p_name, 'set local role authenticated');
    perform * from extensions.dblink(
      p_name,
      format(
        'select set_config(%L, %L, true)',
        'request.jwt.claims',
        json_build_object('sub', p_profile, 'role', 'authenticated')::text
      )
    ) as t(v text);
  end if;
  return v_pid;
end;
$$;

create or replace function pg_temp.race_wait_until_blocked(p_pid integer, p_label text)
returns void
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    exit when exists (select 1 from pg_locks l where l.pid = p_pid and not l.granted);
    if clock_timestamp() > v_deadline then
      raise exception 'not ok - % was never blocked by the first session', p_label;
    end if;
    perform pg_sleep(0.05);
  end loop;
  raise notice 'ok - % is waiting on the first session''s lock', p_label;
end;
$$;

create or replace function pg_temp.race_check(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'not ok - %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

create or replace function pg_temp.race_cleanup_requests()
returns void
language plpgsql
as $$
declare
  v_provider uuid := current_setting('race.provider_id')::uuid;
  v_order uuid := current_setting('race.order_id')::uuid;
  v_since timestamptz := current_setting('race.started_at')::timestamptz;
begin
  create temp table if not exists race_batches (id uuid);
  truncate race_batches;

  with logs as (
    delete from private.notification_delivery_log d
    where d.staff_late_order_request_id in (
        select r.id from private.staff_late_order_requests r where r.provider_id = v_provider
      )
      or (d.order_id = v_order and d.created_at >= v_since)
    returning d.batch_id
  )
  insert into race_batches select batch_id from logs where batch_id is not null;

  delete from private.notification_delivery_batch b
  where b.id in (select id from race_batches)
    and not exists (select 1 from private.notification_delivery_log d where d.batch_id = b.id);

  delete from private.operational_attention_items a
  where a.staff_late_order_request_id in (
    select r.id from private.staff_late_order_requests r where r.provider_id = v_provider
  );
  delete from private.staff_late_order_request_events e
  where e.request_id in (
    select r.id from private.staff_late_order_requests r where r.provider_id = v_provider
  );
  delete from private.staff_late_order_requests r where r.provider_id = v_provider;
end;
$$;

create or replace function pg_temp.race_cleanup()
returns void
language plpgsql
as $$
declare
  v_provider uuid := current_setting('race.provider_id')::uuid;
  v_order uuid := current_setting('race.order_id')::uuid;
  v_since timestamptz := current_setting('race.started_at')::timestamptz;
begin
  perform pg_temp.race_cleanup_requests();

  delete from private.order_notification_lifecycle l
  where l.order_id = v_order and l.created_at >= v_since;
  delete from private.order_notification_state_revisions r
  where r.order_id = v_order and r.created_at >= v_since;

  delete from private.business_calendar_entry_audit a
  where a.entry_id in (
    select e.id from private.business_calendar_entries e where e.name in ('Race closure', 'Race override')
  );
  delete from private.business_calendar_entries e where e.name in ('Race closure', 'Race override');

  delete from public.lunch_providers p where p.id = v_provider;
end;
$$;

create or replace function pg_temp.race_add_override()
returns uuid
language sql
as $$
  insert into private.business_calendar_entries (calendar_date, entry_type, scope, office_location_id, name, source)
  values (current_setting('race.delivery_date')::date, 'override_open', 'global', null, 'Race override', 'manual')
  returning id;
$$;

-- ------------------------------------------------------------
-- Setup (committed)
-- ------------------------------------------------------------

select pg_temp.race_cleanup();

insert into public.lunch_providers (
  id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time,
  supplemental_dispatch_mode, primary_order_email
)
values (
  current_setting('race.provider_id')::uuid, 'Race Late Provider', true, true,
  'delivery_day', '12:00:00', 'manual', 'race-kitchen@example.test'
);

do $$
declare
  v_today date := private.jamaica_today_date();
  v_location uuid;
  v_order_date date;
  v_delivery_date date;
begin
  select p.default_office_location_id into v_location
  from public.profiles p where p.id = current_setting('race.staff1')::uuid;

  select c.order_date, c.delivery_date
  into v_order_date, v_delivery_date
  from (
    select (v_today - offs) as order_date,
           public.delivery_date_for_order_date(v_today - offs, v_location) as delivery_date
    from generate_series(1, 14) as offs
  ) c
  where public.is_business_day(c.order_date, v_location)
    and c.delivery_date >= v_today
    and now() <= public.provider_late_order_deadline_at(
      current_setting('race.provider_id')::uuid, c.order_date, c.delivery_date
    )
    and not private.is_order_date_in_finalized_period(c.order_date)
  order by c.order_date desc
  limit 1;

  if v_delivery_date is null then
    raise exception 'Unable to resolve an open late-order cycle around %', v_today;
  end if;

  if exists (
    select 1 from private.business_calendar_entries e
    where e.calendar_date between v_order_date and v_delivery_date and e.archived_at is null
      and e.source = 'manual'
  ) then
    raise exception 'Manual calendar entries already exist between % and %', v_order_date, v_delivery_date;
  end if;

  perform set_config('race.order_date', v_order_date::text, false);
  perform set_config('race.delivery_date', v_delivery_date::text, false);
  raise notice 'Late-order cycle under test: order % / delivery %', v_order_date, v_delivery_date;
end;
$$;

-- ------------------------------------------------------------
-- Scenario 1: request creation commits first, closure declines it
-- ------------------------------------------------------------

do $$
declare
  v_staff_pid integer;
  v_hr_pid integer;
  v_request_id uuid;
  v_entry_id text;
begin
  v_staff_pid := pg_temp.race_connect('race_staff', current_setting('race.staff1')::uuid);
  select id into v_request_id from extensions.dblink(
    'race_staff',
    format(
      'select public.create_staff_late_order_request(%L, %L::date, %L, 1, null)',
      current_setting('race.provider_id'), current_setting('race.delivery_date'), 'Race lunch'
    )
  ) as t(id uuid);

  v_hr_pid := pg_temp.race_connect('race_hr', current_setting('race.hr')::uuid);
  perform extensions.dblink_send_query(
    'race_hr',
    format(
      'select public.upsert_manual_business_calendar_entry(null, %L::date, %L, %L, null, %L, null, true)::text',
      current_setting('race.delivery_date'), 'company_closure', 'global', 'Race closure'
    )
  );

  perform pg_temp.race_wait_until_blocked(v_hr_pid, 'creation first: calendar closure');
  perform pg_temp.race_check(
    (select r.status = 'pending' from private.staff_late_order_requests r where r.id = v_request_id) is null,
    'creation first: uncommitted request is invisible outside its session'
  );

  perform extensions.dblink_exec('race_staff', 'commit');
  select id into v_entry_id from extensions.dblink_get_result('race_hr') as t(id text);
  perform * from extensions.dblink_get_result('race_hr') as t(id text);
  perform extensions.dblink_exec('race_hr', 'commit');
  perform extensions.dblink_disconnect('race_staff');
  perform extensions.dblink_disconnect('race_hr');

  perform pg_temp.race_check(v_entry_id is not null, 'creation first: closure commits after waiting');
  perform pg_temp.race_check(
    (select r.status from private.staff_late_order_requests r where r.id = v_request_id) = 'declined',
    'creation first: closure automatically declines the request committed before it'
  );
  perform pg_temp.race_check(
    exists (
      select 1 from private.staff_late_order_request_events e
      where e.request_id = v_request_id and e.event_type = 'auto_declined'
        and e.event_payload ->> 'business_calendar_entry_id' = v_entry_id
    ),
    'creation first: auto_declined audit event references the closure'
  );
  perform pg_temp.race_check(
    (select count(*) from private.notification_delivery_log d
     where d.staff_late_order_request_id = v_request_id
       and d.event_key = 'staff.late_order_request_declined') = 1,
    'creation first: employee receives one decline email'
  );
  perform pg_temp.race_check(
    not exists (
      select 1 from private.operational_attention_items a
      where a.staff_late_order_request_id = v_request_id and a.resolved_at is null
    ),
    'creation first: HR bell items are resolved'
  );
end;
$$;

-- Remove the scenario 1 closure so the day is open again.
delete from private.business_calendar_entry_audit a
where a.entry_id in (select e.id from private.business_calendar_entries e where e.name = 'Race closure');
delete from private.business_calendar_entries e where e.name = 'Race closure';

-- ------------------------------------------------------------
-- Scenario 2: closure commits first, creation rejects the closed day
-- ------------------------------------------------------------

do $$
declare
  v_staff_pid integer;
  v_hr_pid integer;
  v_error text;
begin
  v_hr_pid := pg_temp.race_connect('race_hr', current_setting('race.hr')::uuid);
  perform * from extensions.dblink(
    'race_hr',
    format(
      'select public.upsert_manual_business_calendar_entry(null, %L::date, %L, %L, null, %L, null, true)::text',
      current_setting('race.delivery_date'), 'company_closure', 'global', 'Race closure'
    )
  ) as t(id text);

  v_staff_pid := pg_temp.race_connect('race_staff', current_setting('race.staff2')::uuid);
  perform extensions.dblink_send_query(
    'race_staff',
    format(
      'select public.create_staff_late_order_request(%L, %L::date, %L, 1, null)::text',
      current_setting('race.provider_id'), current_setting('race.delivery_date'), 'Race lunch'
    )
  );

  perform pg_temp.race_wait_until_blocked(v_staff_pid, 'closure first: late-order request creation');

  perform extensions.dblink_exec('race_hr', 'commit');
  perform * from extensions.dblink_get_result('race_staff', false) as t(id text);
  v_error := split_part(extensions.dblink_error_message('race_staff'), E'\n', 1);
  perform * from extensions.dblink_get_result('race_staff', false) as t(id text);
  perform extensions.dblink_exec('race_staff', 'rollback');
  perform extensions.dblink_disconnect('race_staff');
  perform extensions.dblink_disconnect('race_hr');

  perform pg_temp.race_check(
    v_error like '%Invalid delivery date%',
    format('closure first: creation is rejected after the closure commits (%s)', v_error)
  );
  perform pg_temp.race_check(
    not exists (
      select 1 from private.staff_late_order_requests r
      where r.provider_id = current_setting('race.provider_id')::uuid
        and r.requester_profile_id = current_setting('race.staff2')::uuid
    ),
    'closure first: no request exists for the closed day'
  );
end;
$$;

-- ------------------------------------------------------------
-- Scenario 4: request creation commits first, override archive must decline it
--   The scenario 2 closure stays on the delivery date; a global override-open
--   reopens it, and archiving that override closes the day again.
-- ------------------------------------------------------------

select set_config('race.override_id', pg_temp.race_add_override()::text, false);

do $$
declare
  v_staff_pid integer;
  v_hr_pid integer;
  v_unconfirmed_request uuid;
  v_request_id uuid;
  v_error text;
  v_override uuid := current_setting('race.override_id')::uuid;
begin
  perform pg_temp.race_check(
    public.is_business_day(current_setting('race.delivery_date')::date, null),
    'archive setup: override reopens the closed delivery date'
  );

  -- 4a: HR archives without confirmation (its preview saw no requests).
  v_staff_pid := pg_temp.race_connect('race_staff', current_setting('race.staff1')::uuid);
  select id into v_unconfirmed_request from extensions.dblink(
    'race_staff',
    format(
      'select public.create_staff_late_order_request(%L, %L::date, %L, 1, null)',
      current_setting('race.provider_id'), current_setting('race.delivery_date'), 'Race lunch'
    )
  ) as t(id uuid);

  v_hr_pid := pg_temp.race_connect('race_hr', current_setting('race.hr')::uuid);
  perform extensions.dblink_send_query(
    'race_hr',
    format('select public.archive_business_calendar_entry(%L::uuid, false)::text', v_override)
  );

  perform pg_temp.race_wait_until_blocked(v_hr_pid, 'creation first: unconfirmed override archive');

  perform extensions.dblink_exec('race_staff', 'commit');
  perform * from extensions.dblink_get_result('race_hr', false) as t(v text);
  v_error := split_part(extensions.dblink_error_message('race_hr'), E'\n', 1);
  perform * from extensions.dblink_get_result('race_hr', false) as t(v text);
  perform extensions.dblink_exec('race_hr', 'rollback');
  perform extensions.dblink_disconnect('race_staff');
  perform extensions.dblink_disconnect('race_hr');

  perform pg_temp.race_check(
    v_error like '%CALENDAR_IMPACT_CONFIRMATION_REQUIRED%',
    format('creation first: unconfirmed archive is rejected once a request commits (%s)', v_error)
  );
  perform pg_temp.race_check(
    (select e.archived_at is null from private.business_calendar_entries e where e.id = v_override)
    and (select r.status from private.staff_late_order_requests r where r.id = v_unconfirmed_request) = 'pending',
    'creation first: rejected archive leaves the override active and the request pending'
  );

  -- 4b: HR archives with confirmation while another request is in flight.
  v_staff_pid := pg_temp.race_connect('race_staff', current_setting('race.staff2')::uuid);
  select id into v_request_id from extensions.dblink(
    'race_staff',
    format(
      'select public.create_staff_late_order_request(%L, %L::date, %L, 1, null)',
      current_setting('race.provider_id'), current_setting('race.delivery_date'), 'Race lunch'
    )
  ) as t(id uuid);

  v_hr_pid := pg_temp.race_connect('race_hr', current_setting('race.hr')::uuid);
  perform extensions.dblink_send_query(
    'race_hr',
    format('select public.archive_business_calendar_entry(%L::uuid, true)::text', v_override)
  );

  perform pg_temp.race_wait_until_blocked(v_hr_pid, 'creation first: confirmed override archive');

  perform extensions.dblink_exec('race_staff', 'commit');
  perform * from extensions.dblink_get_result('race_hr') as t(v text);
  perform * from extensions.dblink_get_result('race_hr') as t(v text);
  perform extensions.dblink_exec('race_hr', 'commit');
  perform extensions.dblink_disconnect('race_staff');
  perform extensions.dblink_disconnect('race_hr');

  perform pg_temp.race_check(
    (select e.archived_at is not null from private.business_calendar_entries e where e.id = v_override),
    'creation first: confirmed archive commits after waiting'
  );
  perform pg_temp.race_check(
    (select count(*) from private.staff_late_order_requests r
     where r.id in (v_unconfirmed_request, v_request_id) and r.status = 'declined') = 2,
    'creation first: archive declines every request committed before it'
  );
  perform pg_temp.race_check(
    (select count(*) from private.staff_late_order_request_events e
     where e.request_id in (v_unconfirmed_request, v_request_id) and e.event_type = 'auto_declined'
       and e.event_payload ->> 'reason_code' = 'business_day_closed'
       and e.event_payload ->> 'initiated_by' = 'hr_calendar_archive'
       and e.event_payload ->> 'business_calendar_entry_id' = v_override::text) = 2,
    'creation first: archive declines are audited against the archived override'
  );
  perform pg_temp.race_check(
    (select count(*) from private.notification_delivery_log d
     where d.staff_late_order_request_id in (v_unconfirmed_request, v_request_id)
       and d.event_key = 'staff.late_order_request_declined') = 2,
    'creation first: each employee receives one decline email'
  );
  perform pg_temp.race_check(
    not exists (
      select 1 from private.operational_attention_items a
      where a.staff_late_order_request_id in (v_unconfirmed_request, v_request_id) and a.resolved_at is null
    ),
    'creation first: HR bell items are resolved after the archive'
  );
end;
$$;

select pg_temp.race_cleanup_requests();

-- ------------------------------------------------------------
-- Scenario 5: override archive commits first, creation rejects the closed day
-- ------------------------------------------------------------

select set_config('race.override_id', pg_temp.race_add_override()::text, false);

do $$
declare
  v_staff_pid integer;
  v_hr_pid integer;
  v_error text;
begin
  v_hr_pid := pg_temp.race_connect('race_hr', current_setting('race.hr')::uuid);
  perform * from extensions.dblink(
    'race_hr',
    format(
      'select public.archive_business_calendar_entry(%L::uuid, false)::text',
      current_setting('race.override_id')
    )
  ) as t(v text);

  v_staff_pid := pg_temp.race_connect('race_staff', current_setting('race.staff1')::uuid);
  perform extensions.dblink_send_query(
    'race_staff',
    format(
      'select public.create_staff_late_order_request(%L, %L::date, %L, 1, null)::text',
      current_setting('race.provider_id'), current_setting('race.delivery_date'), 'Race lunch'
    )
  );

  perform pg_temp.race_wait_until_blocked(v_staff_pid, 'archive first: late-order request creation');

  perform extensions.dblink_exec('race_hr', 'commit');
  perform * from extensions.dblink_get_result('race_staff', false) as t(id text);
  v_error := split_part(extensions.dblink_error_message('race_staff'), E'\n', 1);
  perform * from extensions.dblink_get_result('race_staff', false) as t(id text);
  perform extensions.dblink_exec('race_staff', 'rollback');
  perform extensions.dblink_disconnect('race_staff');
  perform extensions.dblink_disconnect('race_hr');

  perform pg_temp.race_check(
    v_error like '%Invalid delivery date%',
    format('archive first: creation is rejected after the override is archived (%s)', v_error)
  );
  perform pg_temp.race_check(
    not exists (
      select 1 from private.staff_late_order_requests r
      where r.provider_id = current_setting('race.provider_id')::uuid
    ),
    'archive first: no request exists for the re-closed day'
  );
end;
$$;

-- ------------------------------------------------------------
-- Scenario 3: concurrent staff order notification retries
-- ------------------------------------------------------------

do $$
declare
  v_first_pid integer;
  v_retry_pid integer;
  v_stale_pid integer;
  v_order uuid := current_setting('race.order_id')::uuid;
  v_since timestamptz := current_setting('race.started_at')::timestamptz;
begin
  v_first_pid := pg_temp.race_connect('race_notify_first', null);
  perform * from extensions.dblink(
    'race_notify_first',
    format('select private.notify_staff_order_event(%L, %L)::text', 'staff.changed_by_hr', v_order)
  ) as t(v text);

  v_retry_pid := pg_temp.race_connect('race_notify_retry', null);
  perform extensions.dblink_send_query(
    'race_notify_retry',
    format('select private.notify_staff_order_event(%L, %L)::text', 'staff.changed_by_hr', v_order)
  );
  v_stale_pid := pg_temp.race_connect('race_notify_stale', null);
  perform extensions.dblink_send_query(
    'race_notify_stale',
    format('select private.notify_staff_order_event(%L, %L)::text', 'staff.order_changed', v_order)
  );

  perform pg_temp.race_wait_until_blocked(v_retry_pid, 'notification retry');
  perform pg_temp.race_wait_until_blocked(v_stale_pid, 'different-event retry');

  perform extensions.dblink_exec('race_notify_first', 'commit');
  perform * from extensions.dblink_get_result('race_notify_retry') as t(v text);
  perform * from extensions.dblink_get_result('race_notify_retry') as t(v text);
  perform extensions.dblink_exec('race_notify_retry', 'commit');
  perform * from extensions.dblink_get_result('race_notify_stale') as t(v text);
  perform * from extensions.dblink_get_result('race_notify_stale') as t(v text);
  perform extensions.dblink_exec('race_notify_stale', 'commit');
  perform extensions.dblink_disconnect('race_notify_first');
  perform extensions.dblink_disconnect('race_notify_retry');
  perform extensions.dblink_disconnect('race_notify_stale');

  perform pg_temp.race_check(
    (select count(*) from private.notification_delivery_log d
     where d.order_id = v_order and d.created_at >= v_since) = 1,
    'concurrent retries: exactly one staff email is queued'
  );
  perform pg_temp.race_check(
    (select count(*) from private.order_notification_state_revisions r
     where r.order_id = v_order and r.created_at >= v_since) = 1,
    'concurrent retries: one order state revision is recorded'
  );
end;
$$;

-- ------------------------------------------------------------
-- Teardown
-- ------------------------------------------------------------

select pg_temp.race_cleanup();

select pg_temp.race_check(
  not exists (select 1 from public.lunch_providers p where p.id = current_setting('race.provider_id')::uuid)
  and not exists (
    select 1 from private.business_calendar_entries e where e.name in ('Race closure', 'Race override')
  )
  and not exists (
    select 1 from private.order_notification_state_revisions r
    where r.order_id = current_setting('race.order_id')::uuid
      and r.created_at >= current_setting('race.started_at')::timestamptz
  ),
  'teardown: race fixtures removed'
);

\if :race_created_dblink
drop extension dblink;
\endif
