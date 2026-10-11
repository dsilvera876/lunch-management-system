-- Business-calendar changes keep pending staff late-order requests valid.
--
-- Any effective calendar change (adding, editing, moving, rescoping or archiving
-- an entry, or seeding official holidays) can close a request's order or
-- delivery day, or reopen a day so its delivery cycle no longer matches. Each
-- mutation now:
--   1. takes exclusive calendar-date locks on every date it changes (creation
--      and fulfillment hold shared locks on every date of their cycle);
--   2. records which pending requests spanning those dates are calendar-valid;
--   3. applies the change;
--   4. re-evaluates those requests against the real calendar functions and
--      automatically declines the ones the change invalidated.
-- HR edits and archives require explicit confirmation when requests will be
-- declined; official holiday seeding does not. Previews simulate the change in
-- a rolled-back subtransaction so they use exactly the same evaluation.
--
-- Lock order is unchanged: calendar-date advisory locks (ascending) before any
-- calendar entry, request or order row lock.

-- ------------------------------------------------------------
-- 1. Calendar validity of a pending request
-- ------------------------------------------------------------

-- Mirrors the calendar checks of private.assert_staff_late_order_request_window
-- for the request's stored cycle. Null when the cycle is still available.
create or replace function private.staff_late_order_request_calendar_issue(
  p_order_date date,
  p_delivery_date date,
  p_office_location_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_business_day(p_order_date, p_office_location_id)
      or not public.is_business_day(p_delivery_date, p_office_location_id)
      then 'business_day_closed'
    when public.delivery_date_for_order_date(p_order_date, p_office_location_id)
           is distinct from p_delivery_date
      or public.order_date_for_delivery_date(p_delivery_date, p_office_location_id)
           is distinct from p_order_date
      then 'delivery_cycle_changed'
    else null
  end;
$$;

revoke all on function private.staff_late_order_request_calendar_issue(date, date, uuid) from public;

-- Pending, not-yet-delivered requests whose cycle spans any of p_dates and is
-- calendar-valid right now. A change on date X can only affect cycles with
-- order_date <= X <= delivery date.
create or replace function private.calendar_valid_pending_late_requests(p_dates date[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id order by r.created_at, r.id), '{}'::uuid[])
  from private.staff_late_order_requests r
  where r.status = 'pending'
    and r.scheduled_delivery_date >= private.jamaica_today_date()
    and exists (
      select 1
      from unnest(p_dates) as d(calendar_date)
      where d.calendar_date between r.order_date and r.scheduled_delivery_date
    )
    and private.staff_late_order_request_calendar_issue(
      r.order_date, r.scheduled_delivery_date, r.office_location_id
    ) is null;
$$;

revoke all on function private.calendar_valid_pending_late_requests(date[]) from public;

create or replace function private.calendar_invalidated_late_requests(p_candidates uuid[])
returns table (request_id uuid, reason_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, i.reason_code
  from private.staff_late_order_requests r
  cross join lateral (
    select private.staff_late_order_request_calendar_issue(
      r.order_date, r.scheduled_delivery_date, r.office_location_id
    ) as reason_code
  ) i
  where r.id = any (p_candidates)
    and r.status = 'pending'
    and i.reason_code is not null
  order by r.created_at, r.id;
$$;

revoke all on function private.calendar_invalidated_late_requests(uuid[]) from public;

-- ------------------------------------------------------------
-- 2. Automatic decline (replaces the closure-only helper)
-- ------------------------------------------------------------

create or replace function private.auto_decline_late_request_for_calendar_change(
  p_request_id uuid,
  p_actor uuid,
  p_calendar_entry_ids uuid[],
  p_calendar_dates date[],
  p_initiated_by text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.staff_late_order_requests%rowtype;
  v_reason_code text;
  v_reason text;
  v_closed_date date;
begin
  select *
  into v_request
  from private.staff_late_order_requests r
  where r.id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    return false;
  end if;

  v_reason_code := private.staff_late_order_request_calendar_issue(
    v_request.order_date, v_request.scheduled_delivery_date, v_request.office_location_id
  );

  if v_reason_code is null then
    return false;
  end if;

  if v_reason_code = 'business_day_closed' then
    v_closed_date := case
      when public.is_business_day(v_request.order_date, v_request.office_location_id)
        then v_request.scheduled_delivery_date
      else v_request.order_date
    end;
    v_reason := format(
      'Lunch ordering is unavailable because the business day (%s) was closed.',
      to_char(v_closed_date, 'YYYY-MM-DD')
    );
  else
    v_reason := format(
      'The business calendar changed, so the originally requested delivery schedule (order date %s, delivery date %s) is no longer available.',
      to_char(v_request.order_date, 'YYYY-MM-DD'),
      to_char(v_request.scheduled_delivery_date, 'YYYY-MM-DD')
    );
  end if;

  update private.staff_late_order_requests
  set status = 'declined',
      declined_at = now(),
      reviewed_by = p_actor,
      decline_reason = v_reason
  where id = p_request_id
    and status = 'pending';

  perform private.insert_staff_late_order_request_event(
    p_request_id,
    'auto_declined',
    p_actor,
    jsonb_build_object(
      'reason_code', v_reason_code,
      'decline_reason', v_reason,
      'initiated_by', p_initiated_by,
      'business_calendar_entry_id', p_calendar_entry_ids[1],
      'business_calendar_entry_ids', to_jsonb(p_calendar_entry_ids),
      'calendar_date', coalesce(v_closed_date, p_calendar_dates[1]),
      'calendar_dates', to_jsonb(p_calendar_dates)
    )
  );

  perform private.safe_notify_staff_late_order_request_status(
    p_request_id, 'staff.late_order_request_declined'
  );

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);

  return true;
end;
$$;

revoke all on function private.auto_decline_late_request_for_calendar_change(uuid, uuid, uuid[], date[], text)
from public;

-- Declines the candidates the applied change invalidated. Raises the standard
-- confirmation error (rolling back the change) when confirmation is required
-- and was not given.
create or replace function private.decline_calendar_invalidated_late_requests(
  p_candidates uuid[],
  p_actor uuid,
  p_calendar_entry_ids uuid[],
  p_calendar_dates date[],
  p_require_acknowledgment boolean,
  p_acknowledged boolean,
  p_initiated_by text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_ids uuid[];
  v_request_id uuid;
  v_declined integer := 0;
  v_dates date[];
begin
  if coalesce(cardinality(p_candidates), 0) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(i.request_id), '{}'::uuid[])
  into v_request_ids
  from private.calendar_invalidated_late_requests(p_candidates) i;

  if cardinality(v_request_ids) = 0 then
    return 0;
  end if;

  if p_require_acknowledgment and not coalesce(p_acknowledged, false) then
    raise exception
      'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: % pending late-order request(s) will be automatically declined.',
      cardinality(v_request_ids);
  end if;

  select coalesce(array_agg(distinct d order by d), '{}'::date[])
  into v_dates
  from unnest(p_calendar_dates) as d
  where d is not null;

  foreach v_request_id in array v_request_ids
  loop
    if private.auto_decline_late_request_for_calendar_change(
      v_request_id, p_actor, p_calendar_entry_ids, v_dates, p_initiated_by
    ) then
      v_declined := v_declined + 1;
    end if;
  end loop;

  return v_declined;
end;
$$;

revoke all on function private.decline_calendar_invalidated_late_requests(uuid[], uuid, uuid[], date[], boolean, boolean, text)
from public;

drop function if exists private.auto_decline_late_request_for_business_closure(uuid, uuid, uuid, date);
drop function if exists private.business_calendar_affected_pending_late_requests(uuid, date, text, text, uuid);
drop function if exists private.business_calendar_day_open_with_change(date, uuid, uuid, date, text, text, uuid);

-- ------------------------------------------------------------
-- 3. Locking an existing entry together with its current date
-- ------------------------------------------------------------

-- Takes exclusive date locks on the entry's current date plus p_other_dates,
-- then locks the entry row. If a concurrent edit moved the entry before the
-- date lock was granted, the new date is locked too. Returns a null row when
-- the entry does not exist (p_other_dates are still locked).
create or replace function private.lock_business_calendar_entry_for_change(
  p_entry_id uuid,
  p_other_dates date[]
)
returns private.business_calendar_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked date[] := '{}'::date[];
  v_date date;
  v_row private.business_calendar_entries%rowtype;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 5 then
      raise exception 'The calendar entry changed while it was being updated. Please try again.';
    end if;

    select bce.calendar_date into v_date
    from private.business_calendar_entries bce
    where bce.id = p_entry_id;

    v_locked := v_locked || coalesce(p_other_dates, '{}'::date[]) || v_date;
    perform private.lock_business_calendar_dates(v_locked, true);

    select * into v_row
    from private.business_calendar_entries bce
    where bce.id = p_entry_id
    for update;

    if not found or v_row.calendar_date = any (v_locked) then
      return v_row;
    end if;
  end loop;
end;
$$;

revoke all on function private.lock_business_calendar_entry_for_change(uuid, date[]) from public;

-- ------------------------------------------------------------
-- 4. Impact preview
-- ------------------------------------------------------------

-- Lunch schedule and submitted order impact of a closing entry (unchanged rules).
create or replace function private.business_calendar_schedule_impact(
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lunch_day_count integer := 0;
  v_order_count integer := 0;
begin
  if p_calendar_date >= private.jamaica_today_date()
     and private.business_calendar_entry_closes_operations(p_entry_type) then
    v_lunch_day_count := private.business_calendar_impact_lunch_day_count(p_calendar_date);
    v_order_count := private.business_calendar_impact_submitted_order_count(
      p_calendar_date,
      p_scope,
      p_office_location_id
    );
  end if;

  return jsonb_build_object(
    'requires_confirmation', v_lunch_day_count > 0 or v_order_count > 0,
    'lunch_day_count', v_lunch_day_count,
    'submitted_order_count', v_order_count,
    'summary', case
      when v_lunch_day_count > 0 or v_order_count > 0 then format(
        'This date already has %s provider lunch schedule(s) and %s submitted order(s). Saving this closure will stop new normal ordering, but existing orders will not be moved or cancelled.',
        v_lunch_day_count,
        v_order_count
      )
    end
  );
end;
$$;

revoke all on function private.business_calendar_schedule_impact(date, text, text, uuid) from public;

-- Pending late requests invalidated now are handled separately, under the
-- mutation's locks, by private.decline_calendar_invalidated_late_requests.
create or replace function private.assert_business_calendar_impact_acknowledged(
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid,
  p_acknowledge_impact boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impact jsonb;
begin
  v_impact := private.business_calendar_schedule_impact(
    p_calendar_date,
    p_entry_type,
    p_scope,
    p_office_location_id
  );

  if coalesce((v_impact ->> 'requires_confirmation')::boolean, false)
     and not coalesce(p_acknowledge_impact, false) then
    raise exception
      'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: %',
      coalesce(v_impact ->> 'summary', 'Operational impact confirmation required');
  end if;
end;
$$;

revoke all on function private.assert_business_calendar_impact_acknowledged(date, text, text, uuid, boolean)
from public;

-- Applies the proposed change in a subtransaction, counts the pending requests
-- it would invalidate, and rolls the change back. p_archive simulates archiving
-- p_entry_id; otherwise p_entry_id null simulates an insert and non-null an edit.
create or replace function private.simulate_calendar_change_invalidated_count(
  p_entry_id uuid,
  p_archive boolean,
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidates uuid[];
  v_count integer := 0;
begin
  v_candidates := private.calendar_valid_pending_late_requests(
    array[
      p_calendar_date,
      (select bce.calendar_date from private.business_calendar_entries bce where bce.id = p_entry_id)
    ]
  );

  if cardinality(v_candidates) = 0 then
    return 0;
  end if;

  begin
    if p_archive then
      update private.business_calendar_entries
      set archived_at = now()
      where id = p_entry_id
        and archived_at is null;
    elsif p_entry_id is not null then
      update private.business_calendar_entries
      set calendar_date = p_calendar_date,
          entry_type = p_entry_type,
          scope = p_scope,
          office_location_id = p_office_location_id
      where id = p_entry_id;
    else
      insert into private.business_calendar_entries (
        calendar_date, entry_type, scope, office_location_id, name, source
      )
      values (
        p_calendar_date, p_entry_type, p_scope, p_office_location_id, 'Impact preview', 'manual'
      );
    end if;

    select count(*)::integer into v_count
    from private.calendar_invalidated_late_requests(v_candidates);

    raise exception 'calendar impact simulation' using errcode = 'P0L01';
  exception
    when sqlstate 'P0L01' then
      null;
    when others then
      -- The change itself is invalid; the mutation reports that error.
      v_count := 0;
  end;

  return v_count;
end;
$$;

revoke all on function private.simulate_calendar_change_invalidated_count(uuid, boolean, date, text, text, uuid)
from public;

create or replace function private.business_calendar_impact_with_late_requests(
  p_schedule_impact jsonb,
  p_late_request_count integer
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'requires_confirmation',
      coalesce((p_schedule_impact ->> 'requires_confirmation')::boolean, false)
      or p_late_request_count > 0,
    'lunch_day_count', coalesce((p_schedule_impact ->> 'lunch_day_count')::integer, 0),
    'submitted_order_count', coalesce((p_schedule_impact ->> 'submitted_order_count')::integer, 0),
    'pending_late_request_count', p_late_request_count,
    'summary', nullif(
      concat_ws(
        ' ',
        p_schedule_impact ->> 'summary',
        case
          when p_late_request_count > 0 then format(
            '%s pending late-order request(s) will be automatically declined and the employees notified by email.',
            p_late_request_count
          )
        end
      ),
      ''
    )
  );
$$;

revoke all on function private.business_calendar_impact_with_late_requests(jsonb, integer) from public;

create or replace function public.preview_business_calendar_entry_impact(
  p_id uuid,
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := case when p_scope = 'global' then null else p_office_location_id end;
begin
  if not (select private.can_view_hr_operational_data()) then
    raise exception 'Not authorized to preview business calendar impact';
  end if;

  return private.business_calendar_impact_with_late_requests(
    private.business_calendar_schedule_impact(p_calendar_date, p_entry_type, p_scope, v_location_id),
    private.simulate_calendar_change_invalidated_count(
      p_id, false, p_calendar_date, p_entry_type, p_scope, v_location_id
    )
  );
end;
$$;

revoke all on function public.preview_business_calendar_entry_impact(uuid, date, text, text, uuid) from public;
grant execute on function public.preview_business_calendar_entry_impact(uuid, date, text, text, uuid) to authenticated;

create or replace function public.preview_business_calendar_archive_impact(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry private.business_calendar_entries%rowtype;
  v_count integer := 0;
begin
  if not (select private.can_view_hr_operational_data()) then
    raise exception 'Not authorized to preview business calendar impact';
  end if;

  select * into v_entry
  from private.business_calendar_entries bce
  where bce.id = p_id;

  if found and v_entry.archived_at is null and v_entry.source <> 'official' then
    v_count := private.simulate_calendar_change_invalidated_count(
      p_id, true, v_entry.calendar_date, v_entry.entry_type, v_entry.scope, v_entry.office_location_id
    );
  end if;

  return private.business_calendar_impact_with_late_requests(
    jsonb_build_object('requires_confirmation', false),
    v_count
  );
end;
$$;

revoke all on function public.preview_business_calendar_archive_impact(uuid) from public;
grant execute on function public.preview_business_calendar_archive_impact(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Calendar upsert
-- ------------------------------------------------------------

create or replace function public.upsert_manual_business_calendar_entry(
  p_id uuid,
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid,
  p_name text,
  p_notes text,
  p_acknowledge_impact boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_today date := private.jamaica_today_date();
  v_existing private.business_calendar_entries%rowtype;
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_location_id uuid;
  v_candidates uuid[];
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'Not authorized to manage business calendar';
  end if;

  perform private.expire_stale_support_sessions();

  if p_entry_type not in (
    'public_holiday',
    'company_closure',
    'override_open',
    'override_closed'
  ) then
    raise exception 'Invalid entry type';
  end if;

  if p_scope not in ('global', 'location') then
    raise exception 'Invalid scope';
  end if;

  if p_scope = 'global' and p_office_location_id is not null then
    raise exception 'Global entries cannot specify a location';
  end if;

  if p_scope = 'location' and p_office_location_id is null then
    raise exception 'Location scope requires an office location';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Event name is required';
  end if;

  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Notes must be 500 characters or fewer';
  end if;

  v_location_id := case when p_scope = 'global' then null else p_office_location_id end;

  if p_id is not null then
    v_existing := private.lock_business_calendar_entry_for_change(p_id, array[p_calendar_date]);

    if v_existing.id is null then
      raise exception 'Calendar entry not found';
    end if;

    if v_existing.archived_at is not null then
      raise exception 'Archived entries cannot be edited';
    end if;

    if v_existing.source = 'official' then
      raise exception 'Official holidays cannot be edited; add an override instead';
    end if;

    if v_existing.calendar_date < v_today then
      if v_existing.calendar_date is distinct from p_calendar_date
         or v_existing.entry_type is distinct from p_entry_type
         or v_existing.scope is distinct from p_scope
         or v_existing.office_location_id is distinct from v_location_id then
        raise exception 'Historical calendar entries cannot change date, type, or scope';
      end if;
    end if;
  else
    perform private.lock_business_calendar_dates(array[p_calendar_date], true);
  end if;

  perform private.assert_business_calendar_impact_acknowledged(
    p_calendar_date,
    p_entry_type,
    p_scope,
    v_location_id,
    p_acknowledge_impact
  );

  v_candidates := private.calendar_valid_pending_late_requests(
    array[p_calendar_date, v_existing.calendar_date]
  );

  if p_id is not null then
    v_old := to_jsonb(v_existing);

    update private.business_calendar_entries
    set
      calendar_date = p_calendar_date,
      entry_type = p_entry_type,
      scope = p_scope,
      office_location_id = v_location_id,
      name = trim(p_name),
      notes = nullif(trim(p_notes), ''),
      updated_by = v_actor
    where id = p_id
    returning id into v_id;

    select to_jsonb(bce.*)
    into v_new
    from private.business_calendar_entries bce
    where bce.id = v_id;

    perform private.audit_business_calendar_entry_change(
      v_id,
      'update',
      v_old,
      v_new,
      v_actor
    );
  else
    insert into private.business_calendar_entries (
      calendar_date,
      entry_type,
      scope,
      office_location_id,
      name,
      notes,
      source,
      created_by,
      updated_by
    )
    values (
      p_calendar_date,
      p_entry_type,
      p_scope,
      v_location_id,
      trim(p_name),
      nullif(trim(p_notes), ''),
      'manual',
      v_actor,
      v_actor
    )
    returning id into v_id;

    select to_jsonb(bce.*)
    into v_new
    from private.business_calendar_entries bce
    where bce.id = v_id;

    perform private.audit_business_calendar_entry_change(
      v_id,
      'insert',
      null,
      v_new,
      v_actor
    );
  end if;

  perform private.decline_calendar_invalidated_late_requests(
    v_candidates,
    v_actor,
    array[v_id],
    array[p_calendar_date, v_existing.calendar_date],
    true,
    p_acknowledge_impact,
    'hr_calendar_change'
  );

  return v_id;
end;
$$;

revoke all on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text, boolean)
from public;
grant execute on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text, boolean)
to authenticated;

-- ------------------------------------------------------------
-- 6. Calendar archive
-- ------------------------------------------------------------

drop function if exists public.archive_business_calendar_entry(uuid);

create or replace function public.archive_business_calendar_entry(
  p_id uuid,
  p_acknowledge_impact boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_existing private.business_calendar_entries%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_candidates uuid[];
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'Not authorized to manage business calendar';
  end if;

  perform private.expire_stale_support_sessions();

  v_existing := private.lock_business_calendar_entry_for_change(p_id, '{}'::date[]);

  if v_existing.id is null then
    raise exception 'Calendar entry not found';
  end if;

  if v_existing.archived_at is not null then
    return;
  end if;

  if v_existing.source = 'official' then
    raise exception 'Official holidays cannot be archived; add an override instead';
  end if;

  v_candidates := private.calendar_valid_pending_late_requests(array[v_existing.calendar_date]);

  v_old := to_jsonb(v_existing);

  update private.business_calendar_entries
  set
    archived_at = now(),
    archived_by = v_actor,
    updated_by = v_actor
  where id = p_id;

  select to_jsonb(bce.*)
  into v_new
  from private.business_calendar_entries bce
  where bce.id = p_id;

  perform private.audit_business_calendar_entry_change(
    p_id,
    'archive',
    v_old,
    v_new,
    v_actor
  );

  perform private.decline_calendar_invalidated_late_requests(
    v_candidates,
    v_actor,
    array[p_id],
    array[v_existing.calendar_date],
    true,
    p_acknowledge_impact,
    'hr_calendar_archive'
  );
end;
$$;

revoke all on function public.archive_business_calendar_entry(uuid, boolean) from public;
grant execute on function public.archive_business_calendar_entry(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 7. Official holiday seeding
-- ------------------------------------------------------------

create or replace function private.seed_jamaica_official_public_holidays_2026()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_dates constant date[] := array[
    '2026-01-01', '2026-02-18', '2026-04-03', '2026-04-06', '2026-05-25',
    '2026-08-01', '2026-08-06', '2026-10-19', '2026-12-25', '2026-12-26'
  ]::date[];
  v_names constant text[] := array[
    'New Year''s Day', 'Ash Wednesday', 'Good Friday', 'Easter Monday', 'National Labour Day',
    'Emancipation Day', 'Independence Day', 'National Heroes'' Day', 'Christmas Day', 'Boxing Day'
  ];
  v_index integer;
  v_candidates uuid[];
  v_entry private.business_calendar_entries%rowtype;
  v_entry_ids uuid[] := '{}'::uuid[];
  v_entry_dates date[] := '{}'::date[];
begin
  perform private.lock_business_calendar_dates(v_dates, true);

  v_candidates := private.calendar_valid_pending_late_requests(v_dates);

  for v_index in 1 .. cardinality(v_dates)
  loop
    if private.insert_official_jamaica_public_holiday_if_absent(v_dates[v_index], v_names[v_index]) then
      select * into v_entry
      from private.business_calendar_entries bce
      where bce.calendar_date = v_dates[v_index]
        and bce.source = 'official'
        and bce.entry_type = 'public_holiday'
        and bce.scope = 'global'
        and bce.archived_at is null;

      perform private.audit_business_calendar_entry_change(
        v_entry.id,
        'insert',
        null,
        to_jsonb(v_entry),
        v_actor
      );

      v_entry_ids := v_entry_ids || v_entry.id;
      v_entry_dates := v_entry_dates || v_entry.calendar_date;
    end if;
  end loop;

  if cardinality(v_entry_ids) > 0 then
    perform private.decline_calendar_invalidated_late_requests(
      v_candidates,
      v_actor,
      v_entry_ids,
      v_entry_dates,
      false,
      true,
      'official_holiday_seed'
    );
  end if;

  return cardinality(v_entry_ids);
end;
$$;

revoke all on function private.seed_jamaica_official_public_holidays_2026() from public;

-- ------------------------------------------------------------
-- 8. Fulfillment never reschedules a request
-- ------------------------------------------------------------

create or replace function public.fulfill_staff_late_order_request(
  p_request_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
  v_order_id uuid;
  v_location uuid;
  v_order_date date;
  v_delivery_date date;
  v_request_location uuid;
  v_default_location uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  select r.order_date, r.scheduled_delivery_date, r.office_location_id, pr.default_office_location_id
  into v_order_date, v_delivery_date, v_request_location, v_default_location
  from private.staff_late_order_requests r
  left join public.profiles pr on pr.id = r.requester_profile_id
  where r.id = p_request_id;

  if not found then
    raise exception 'Request not found';
  end if;

  -- Date locks before the request row lock, covering every cycle the creation
  -- core may recompute, so no new date lock is taken while the row is held.
  perform private.lock_late_order_cycle_dates(
    v_delivery_date,
    array[coalesce(p_office_location_id, v_request_location), v_request_location, v_default_location],
    v_order_date
  );

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.status = 'fulfilled' then
    return v_request.fulfilled_order_id;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be fulfilled';
  end if;

  if private.staff_late_order_request_calendar_issue(
    v_request.order_date, v_request.scheduled_delivery_date, v_request.office_location_id
  ) is not null then
    raise exception 'The business calendar changed and this request''s delivery schedule is no longer available';
  end if;

  v_location := coalesce(p_office_location_id, v_request.office_location_id);

  perform private.assert_staff_late_order_request_window(
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date,
    now(),
    v_location
  );

  if private.profile_has_submitted_late_order(
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date
  ) then
    raise exception 'A late order already exists for this employee, provider, and delivery date';
  end if;

  v_order_id := private.create_hr_late_order_core(
    v_actor,
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date,
    p_items,
    p_special_instructions,
    v_location,
    null
  );

  update private.staff_late_order_requests
  set status = 'fulfilled',
      fulfilled_at = now(),
      fulfilled_order_id = v_order_id,
      reviewed_by = v_actor
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Request is no longer pending';
  end if;

  perform private.insert_staff_late_order_request_event(
    p_request_id, 'fulfilled', v_actor,
    jsonb_build_object('fulfilled_order_id', v_order_id)
  );

  perform private.safe_notify_staff_late_order_request_status(
    p_request_id, 'staff.late_order_request_fulfilled'
  );

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);

  return v_order_id;
end;
$$;

revoke execute on function public.fulfill_staff_late_order_request(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.fulfill_staff_late_order_request(uuid, jsonb, text, uuid) to authenticated;
