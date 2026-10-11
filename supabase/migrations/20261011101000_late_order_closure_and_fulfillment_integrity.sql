-- Late-order integrity:
--   1. Business-calendar closures automatically decline pending staff late-order
--      requests whose order or delivery date becomes closed, atomically with the
--      calendar write and serialized against concurrent HR fulfillment.
--   2. Fulfilling a staff late-order request sends only the fulfillment
--      confirmation, not an additional "changed by HR" order email.
--   3. Staff late-order requests and direct HR late orders take shared locks on
--      their cycle dates and revalidate business-day eligibility under them, so a
--      closure either declines a request created first or the creation rejects
--      a day closed first.
--
-- Lock order: calendar date advisory locks (ascending date) are always taken
-- before request or order row locks. Calendar writes take them exclusive;
-- late-order creation and fulfillment take them shared.

-- ------------------------------------------------------------
-- 1. Audit event type for automatic declines
-- ------------------------------------------------------------

alter table private.staff_late_order_request_events
  drop constraint staff_late_order_request_events_type_check;

alter table private.staff_late_order_request_events
  add constraint staff_late_order_request_events_type_check
  check (event_type in (
    'submitted', 'updated', 'cancelled', 'fulfilled', 'declined', 'auto_declined', 'expired'
  ));

-- ------------------------------------------------------------
-- 2. Calendar date locks (closure exclusive, fulfillment shared)
-- ------------------------------------------------------------

create or replace function private.business_calendar_date_lock_key(p_date date)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended('business_calendar_date:' || p_date::text, 0);
$$;

revoke all on function private.business_calendar_date_lock_key(date) from public;

create or replace function private.lock_business_calendar_dates(
  p_dates date[],
  p_exclusive boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
begin
  for v_date in
    select distinct d
    from unnest(p_dates) d
    where d is not null
    order by d
  loop
    if p_exclusive then
      perform pg_advisory_xact_lock(private.business_calendar_date_lock_key(v_date));
    else
      perform pg_advisory_xact_lock_shared(private.business_calendar_date_lock_key(v_date));
    end if;
  end loop;
end;
$$;

revoke all on function private.lock_business_calendar_dates(date[], boolean) from public;

-- Shared locks on every date of a late-order cycle (order date through delivery
-- date) for each candidate location, so a concurrent calendar write on any date
-- that could change the cycle waits for, or is waited on by, the caller. The
-- cycle is recomputed after locking (each statement sees newly committed calendar
-- rows under READ COMMITTED); if it widened, the extra dates are locked too.
-- Callers must revalidate business-day eligibility after this returns.
create or replace function private.lock_late_order_cycle_dates(
  p_delivery_date date,
  p_office_location_ids uuid[],
  p_include_from date default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_from date;
  v_locked_from date;
  v_attempt integer := 0;
begin
  if p_delivery_date is null then
    return;
  end if;

  loop
    select least(
      p_delivery_date,
      coalesce(p_include_from, p_delivery_date),
      coalesce(min(public.order_date_for_delivery_date(p_delivery_date, l.id)), p_delivery_date)
    )
    into v_from
    from unnest(coalesce(p_office_location_ids, array[null::uuid])) as l(id);

    if v_locked_from is not null and v_from >= v_locked_from then
      return;
    end if;

    v_attempt := v_attempt + 1;
    if v_attempt > 5 then
      raise exception 'The business calendar changed while processing this late order. Please try again.';
    end if;

    perform private.lock_business_calendar_dates(
      array(select generate_series(v_from, p_delivery_date, interval '1 day')::date),
      false
    );
    v_locked_from := v_from;
  end loop;
end;
$$;

revoke all on function private.lock_late_order_cycle_dates(date, uuid[], date) from public;

-- ------------------------------------------------------------
-- 3. Effective open/closed state with a pending calendar change applied
-- ------------------------------------------------------------

-- Mirrors private.business_calendar_day_open precedence (location override,
-- global override, location closure, global closure, weekend) over the active
-- entries for p_date, excluding p_exclude_entry_id and including the candidate
-- entry when it falls on p_date.
create or replace function private.business_calendar_day_open_with_change(
  p_date date,
  p_office_location_id uuid,
  p_exclude_entry_id uuid,
  p_candidate_date date,
  p_candidate_entry_type text,
  p_candidate_scope text,
  p_candidate_office_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with entries as (
    select bce.entry_type, bce.scope, bce.office_location_id
    from private.business_calendar_entries bce
    where bce.calendar_date = p_date
      and bce.archived_at is null
      and bce.id is distinct from p_exclude_entry_id
    union all
    select p_candidate_entry_type, p_candidate_scope, p_candidate_office_location_id
    where p_candidate_date = p_date
  ),
  location_override as (
    select min(e.entry_type) as entry_type
    from entries e
    where p_office_location_id is not null
      and e.scope = 'location'
      and e.office_location_id = p_office_location_id
      and e.entry_type in ('override_open', 'override_closed')
  ),
  global_override as (
    select min(e.entry_type) as entry_type
    from entries e
    where e.scope = 'global'
      and e.entry_type in ('override_open', 'override_closed')
  )
  select case
    when (select entry_type from location_override) is not null
      then (select entry_type from location_override) = 'override_open'
    when (select entry_type from global_override) is not null
      then (select entry_type from global_override) = 'override_open'
    when exists (
      select 1 from entries e
      where p_office_location_id is not null
        and e.scope = 'location'
        and e.office_location_id = p_office_location_id
        and e.entry_type in ('public_holiday', 'company_closure')
    ) then false
    when exists (
      select 1 from entries e
      where e.scope = 'global'
        and e.entry_type in ('public_holiday', 'company_closure')
    ) then false
    else extract(isodow from p_date)::int not in (6, 7)
  end;
$$;

revoke all on function private.business_calendar_day_open_with_change(date, uuid, uuid, date, text, text, uuid)
from public;

-- ------------------------------------------------------------
-- 4. Pending late-order requests affected by a calendar change
-- ------------------------------------------------------------

-- A pending request is affected when its order date or delivery date is the
-- changed date, both dates are open now, and either becomes closed for the
-- request's office location once the change is applied.
create or replace function private.business_calendar_affected_pending_late_requests(
  p_id uuid,
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid
)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from private.staff_late_order_requests r
  where p_calendar_date >= private.jamaica_today_date()
    and private.business_calendar_entry_closes_operations(p_entry_type)
    and r.status = 'pending'
    and (r.order_date = p_calendar_date or r.scheduled_delivery_date = p_calendar_date)
    and public.is_business_day(r.order_date, r.office_location_id)
    and public.is_business_day(r.scheduled_delivery_date, r.office_location_id)
    and not (
      private.business_calendar_day_open_with_change(
        r.order_date, r.office_location_id, p_id,
        p_calendar_date, p_entry_type, p_scope, p_office_location_id
      )
      and private.business_calendar_day_open_with_change(
        r.scheduled_delivery_date, r.office_location_id, p_id,
        p_calendar_date, p_entry_type, p_scope, p_office_location_id
      )
    )
  order by r.created_at, r.id;
$$;

revoke all on function private.business_calendar_affected_pending_late_requests(uuid, date, text, text, uuid)
from public;

-- ------------------------------------------------------------
-- 5. Impact preview: include pending late-order requests
-- ------------------------------------------------------------

create or replace function public.preview_business_calendar_entry_impact(
  p_id uuid,
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.jamaica_today_date();
  v_lunch_day_count integer := 0;
  v_order_count integer := 0;
  v_late_request_count integer := 0;
  v_requires boolean := false;
  v_summary text;
  v_location_id uuid := case when p_scope = 'global' then null else p_office_location_id end;
begin
  if not (select private.can_view_hr_operational_data()) then
    raise exception 'Not authorized to preview business calendar impact';
  end if;

  if p_calendar_date < v_today
     or not private.business_calendar_entry_closes_operations(p_entry_type) then
    return jsonb_build_object(
      'requires_confirmation', false,
      'lunch_day_count', 0,
      'submitted_order_count', 0,
      'pending_late_request_count', 0,
      'summary', null
    );
  end if;

  v_lunch_day_count := private.business_calendar_impact_lunch_day_count(p_calendar_date);
  v_order_count := private.business_calendar_impact_submitted_order_count(
    p_calendar_date,
    p_scope,
    p_office_location_id
  );

  select count(*)::integer
  into v_late_request_count
  from private.business_calendar_affected_pending_late_requests(
    p_id, p_calendar_date, p_entry_type, p_scope, v_location_id
  );

  v_requires := v_lunch_day_count > 0 or v_order_count > 0 or v_late_request_count > 0;

  if v_requires then
    v_summary := format(
      'This date already has %s provider lunch schedule(s) and %s submitted order(s). Saving this closure will stop new normal ordering, but existing orders will not be moved or cancelled.',
      v_lunch_day_count,
      v_order_count
    );

    if v_late_request_count > 0 then
      v_summary := v_summary || format(
        ' %s pending late-order request(s) will be automatically declined and the employees notified by email.',
        v_late_request_count
      );
    end if;
  end if;

  return jsonb_build_object(
    'requires_confirmation', v_requires,
    'lunch_day_count', v_lunch_day_count,
    'submitted_order_count', v_order_count,
    'pending_late_request_count', v_late_request_count,
    'summary', v_summary
  );
end;
$$;

revoke all on function public.preview_business_calendar_entry_impact(uuid, date, text, text, uuid) from public;
grant execute on function public.preview_business_calendar_entry_impact(uuid, date, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Automatic decline
-- ------------------------------------------------------------

create or replace function private.auto_decline_late_request_for_business_closure(
  p_request_id uuid,
  p_actor uuid,
  p_calendar_entry_id uuid,
  p_calendar_date date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.staff_late_order_requests%rowtype;
  v_reason text;
begin
  select *
  into v_request
  from private.staff_late_order_requests r
  where r.id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    return false;
  end if;

  if public.is_business_day(v_request.order_date, v_request.office_location_id)
     and public.is_business_day(v_request.scheduled_delivery_date, v_request.office_location_id) then
    return false;
  end if;

  v_reason := format(
    'Lunch ordering is unavailable because the business day (%s) was closed.',
    to_char(p_calendar_date, 'YYYY-MM-DD')
  );

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
      'reason_code', 'business_day_closed',
      'decline_reason', v_reason,
      'business_calendar_entry_id', p_calendar_entry_id,
      'calendar_date', p_calendar_date
    )
  );

  perform private.safe_notify_staff_late_order_request_status(
    p_request_id, 'staff.late_order_request_declined'
  );

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);

  return true;
end;
$$;

revoke all on function private.auto_decline_late_request_for_business_closure(uuid, uuid, uuid, date)
from public;

-- ------------------------------------------------------------
-- 7. Calendar upsert: lock dates, decline affected requests in-transaction
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
  v_previous_date date;
  v_affected_request_ids uuid[];
  v_request_id uuid;
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
    select bce.calendar_date
    into v_previous_date
    from private.business_calendar_entries bce
    where bce.id = p_id;
  end if;

  perform private.lock_business_calendar_dates(
    array[p_calendar_date, v_previous_date],
    true
  );

  perform private.assert_business_calendar_impact_acknowledged(
    p_calendar_date,
    p_entry_type,
    p_scope,
    v_location_id,
    p_acknowledge_impact
  );

  select coalesce(array_agg(a.id), '{}'::uuid[])
  into v_affected_request_ids
  from private.business_calendar_affected_pending_late_requests(
    p_id, p_calendar_date, p_entry_type, p_scope, v_location_id
  ) as a(id);

  if cardinality(v_affected_request_ids) > 0 and not coalesce(p_acknowledge_impact, false) then
    raise exception
      'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: % pending late-order request(s) will be automatically declined.',
      cardinality(v_affected_request_ids);
  end if;

  if p_id is not null then
    select *
    into v_existing
    from private.business_calendar_entries
    where id = p_id
    for update;

    if not found then
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

  foreach v_request_id in array v_affected_request_ids
  loop
    perform private.auto_decline_late_request_for_business_closure(
      v_request_id,
      v_actor,
      v_id,
      p_calendar_date
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text, boolean)
from public;
grant execute on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text, boolean)
to authenticated;

-- ------------------------------------------------------------
-- 8. HR late-order creation core: optional staff order notification
-- ------------------------------------------------------------

create or replace function private.create_hr_late_order_core(
  p_actor uuid,
  p_profile_id uuid,
  p_provider_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid,
  p_staff_order_event_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_lunch_day_id uuid;
  v_jamaica_today date := private.jamaica_today_date();
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_order_id uuid;
  v_order_group_id uuid := gen_random_uuid();
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_special_instructions text;
begin
  if not exists (
    select 1 from public.profiles pr where pr.id = p_profile_id
  ) then
    raise exception 'Employee not found';
  end if;

  perform private.lock_late_order_cycle_dates(
    p_delivery_date,
    array[
      p_office_location_id,
      (select pr.default_office_location_id from public.profiles pr where pr.id = p_profile_id)
    ]
  );

  perform private.assert_staff_late_order_request_window(
    p_profile_id,
    p_provider_id,
    p_delivery_date,
    now(),
    p_office_location_id
  );

  v_order_date := public.order_date_for_delivery_date(p_delivery_date, p_office_location_id);

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(p_provider_id, v_order_date);

  if v_lunch_day_id is null then
    if v_order_date < v_jamaica_today then
      raise exception 'The menu snapshot for this provider and order date is unavailable.';
    elsif v_order_date = v_jamaica_today then
      v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
    else
      raise exception 'The menu snapshot for this provider and order date is unavailable.';
    end if;
  elsif v_order_date = v_jamaica_today then
    v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(v_lunch_day_id, p_items);
  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_hr_order_office_location_snapshot(p_office_location_id);

  v_special_instructions := private.normalize_special_instructions(p_special_instructions);

  if length(trim(coalesce(p_special_instructions, ''))) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.activate_bypass_order_deadline();

  insert into public.orders (
    profile_id, lunch_day_id, meal_quantity,
    office_location_id, office_location_name, office_location_address,
    special_instructions, is_late_order,
    late_order_created_by, late_order_approved_at, late_order_approved_by,
    order_group_id
  )
  values (
    p_profile_id, v_lunch_day_id, v_meal_quantity,
    v_location_id, v_location_name, v_location_address,
    v_special_instructions, true,
    p_actor, now(), p_actor,
    v_order_group_id
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity)
    values (v_order_id, v_menu_item_id, v_lunch_day_id, v_quantity);
  end loop;

  if p_staff_order_event_key is not null then
    perform private.safe_notify_staff_order_event(p_staff_order_event_key, v_order_id);
  else
    perform private.record_order_notification_state_revision(v_order_id, null);
  end if;

  return v_order_id;
end;
$$;

revoke all on function private.create_hr_late_order_core(uuid, uuid, uuid, date, jsonb, text, uuid, text) from public;

-- Direct HR late-order creation keeps its existing staff.changed_by_hr email.
create or replace function private.create_hr_late_order_core(
  p_actor uuid,
  p_profile_id uuid,
  p_provider_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.create_hr_late_order_core(
    p_actor,
    p_profile_id,
    p_provider_id,
    p_delivery_date,
    p_items,
    p_special_instructions,
    p_office_location_id,
    'staff.changed_by_hr'
  );
$$;

revoke all on function private.create_hr_late_order_core(uuid, uuid, uuid, date, jsonb, text, uuid) from public;

-- ------------------------------------------------------------
-- 9. Fulfillment: one staff email, serialized against calendar closure
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

-- ------------------------------------------------------------
-- 10. Staff late-order request creation: serialized against calendar closure
-- ------------------------------------------------------------

create or replace function public.create_staff_late_order_request(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_requested_summary text,
  p_quantity integer default 1,
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
  v_location_id uuid;
  v_order_date date;
  v_summary text := btrim(p_requested_summary);
  v_instructions text;
  v_request_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if v_summary is null or char_length(v_summary) = 0 or char_length(v_summary) > 500 then
    raise exception 'Request summary is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  v_instructions := nullif(btrim(coalesce(p_special_instructions, '')), '');
  if v_instructions is not null and char_length(v_instructions) > 500 then
    raise exception 'Special instructions are too long';
  end if;

  v_location_id := private.resolve_staff_late_order_office_location(v_actor, p_office_location_id);

  perform private.lock_late_order_cycle_dates(p_scheduled_delivery_date, array[v_location_id]);

  perform private.assert_staff_late_order_request_window(
    v_actor,
    p_provider_id,
    p_scheduled_delivery_date,
    now(),
    v_location_id
  );

  perform private.assert_staff_late_order_submission_slot_available(
    v_actor,
    p_provider_id,
    p_scheduled_delivery_date
  );

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date, v_location_id);

  insert into private.staff_late_order_requests (
    requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
    status, requested_summary, quantity, special_instructions
  )
  values (
    v_actor, p_provider_id, v_location_id, v_order_date, p_scheduled_delivery_date,
    'pending', v_summary, p_quantity, v_instructions
  )
  returning id into v_request_id;

  perform private.insert_staff_late_order_request_event(
    v_request_id, 'submitted', v_actor,
    jsonb_build_object('provider_id', p_provider_id, 'scheduled_delivery_date', p_scheduled_delivery_date)
  );

  perform private.safe_notify_hr_late_order_submitted(v_request_id);
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A late order request already exists for this provider and delivery date';
end;
$$;

revoke execute on function public.create_staff_late_order_request(uuid, date, text, integer, text, uuid) from public, anon;
grant execute on function public.create_staff_late_order_request(uuid, date, text, integer, text, uuid) to authenticated;
