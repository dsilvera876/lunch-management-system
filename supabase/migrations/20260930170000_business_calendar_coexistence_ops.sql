-- Business calendar: closure+override coexistence helpers, impact preview, operational wiring.

create or replace function private.business_calendar_entry_closes_operations(
  p_entry_type text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_entry_type in (
    'public_holiday',
    'company_closure',
    'override_closed'
  );
$$;

revoke all on function private.business_calendar_entry_closes_operations(text) from public;

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
  v_requires boolean := false;
  v_summary text;
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
      'summary', null
    );
  end if;

  select count(*)
  into v_lunch_day_count
  from public.lunch_days ld
  where ld.order_date = p_calendar_date
     or ld.lunch_date = p_calendar_date;

  select count(*)
  into v_order_count
  from public.orders o
  inner join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.status = 'submitted'
    and (ld.order_date = p_calendar_date or ld.lunch_date = p_calendar_date)
    and (
      p_scope = 'global'
      or o.office_location_id is not distinct from p_office_location_id
    );

  v_requires := v_lunch_day_count > 0 or v_order_count > 0;

  if v_requires then
    v_summary := format(
      'This date already has %s provider lunch schedule(s) and %s submitted order(s). Saving this closure will stop new normal ordering, but existing orders will not be moved or cancelled.',
      v_lunch_day_count,
      v_order_count
    );
  end if;

  return jsonb_build_object(
    'requires_confirmation', v_requires,
    'lunch_day_count', v_lunch_day_count,
    'submitted_order_count', v_order_count,
    'summary', v_summary
  );
end;
$$;

revoke all on function public.preview_business_calendar_entry_impact(uuid, date, text, text, uuid) from public;
grant execute on function public.preview_business_calendar_entry_impact(uuid, date, text, text, uuid) to authenticated;

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
  v_preview jsonb;
begin
  v_preview := public.preview_business_calendar_entry_impact(
    null,
    p_calendar_date,
    p_entry_type,
    p_scope,
    p_office_location_id
  );

  if coalesce((v_preview ->> 'requires_confirmation')::boolean, false)
     and not coalesce(p_acknowledge_impact, false) then
    raise exception
      'CALENDAR_IMPACT_CONFIRMATION_REQUIRED: %',
      coalesce(v_preview ->> 'summary', 'Operational impact confirmation required');
  end if;
end;
$$;

revoke all on function private.assert_business_calendar_impact_acknowledged(date, text, text, uuid, boolean)
from public;

drop function if exists public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text);

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

  perform private.assert_business_calendar_impact_acknowledged(
    p_calendar_date,
    p_entry_type,
    p_scope,
    v_location_id,
    p_acknowledge_impact
  );

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

    return v_id;
  end if;

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

  return v_id;
end;
$$;

revoke all on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text, boolean)
from public;
grant execute on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text, boolean)
to authenticated;

-- Official holiday seeding (verified dates supplied in separate migrations).
create or replace function public.seed_official_business_calendar_year(p_year integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'Not authorized to seed business calendar';
  end if;

  -- Idempotent yearly seed: insert source=official rows with observed calendar_date.
  -- Manual overrides and proclaimed holidays are preserved (separate override rows).
  -- No verified Jamaica dates are bundled in this repository.
  return 0;
end;
$$;

create or replace function public.materialize_provider_snapshots_for_order_date(
  p_order_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider record;
  v_count integer := 0;
  v_today date := private.jamaica_today_date();
begin
  if p_order_date <> v_today then
    raise exception
      'Provider snapshots may only be materialized for the current Jamaica order date';
  end if;

  if not public.is_business_day(p_order_date, null) then
    return 0;
  end if;

  for v_provider in
    select id
    from public.lunch_providers
    where active = true
  loop
    perform private.ensure_provider_lunch_day(v_provider.id, p_order_date);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.worker_materialize_current_order_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date := private.jamaica_today_date();
  v_provider record;
  v_materialized integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  perform private.assert_worker_service_caller();

  if not public.is_business_day(v_order_date, null) then
    return jsonb_build_object(
      'order_date', v_order_date,
      'materialized', 0,
      'failures', '[]'::jsonb,
      'skipped', 'calendar_closed'
    );
  end if;

  for v_provider in
    select id, name
    from public.lunch_providers
    where active = true
    order by name
  loop
    begin
      perform private.ensure_provider_lunch_day(v_provider.id, v_order_date);
      v_materialized := v_materialized + 1;
    exception
      when others then
        v_failures := v_failures || jsonb_build_array(
          jsonb_build_object(
            'provider_id', v_provider.id,
            'provider_name', v_provider.name,
            'error', sqlerrm
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'order_date', v_order_date,
    'materialized', v_materialized,
    'failures', v_failures
  );
end;
$$;

create or replace function public.worker_list_due_automatic_supplement_batches()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batches jsonb := '[]'::jsonb;
  v_provider record;
  v_order_date date;
  v_delivery_date date;
  v_offset integer;
begin
  perform private.assert_worker_service_caller();

  for v_provider in
    select id
    from public.lunch_providers
    where active = true
      and supplemental_dispatch_mode = 'automatic'
      and accepts_late_orders = true
  loop
    foreach v_offset in array array[0, 1, 2, 3, 4, 5, 6]
    loop
      v_order_date := (private.jamaica_today_date() - v_offset)::date;

      if not public.is_business_day(v_order_date, null) then
        continue;
      end if;

      v_delivery_date := public.delivery_date_for_order_date(v_order_date);

      if v_delivery_date is null then
        continue;
      end if;

      if (select private.automatic_opportunity_exists(v_provider.id, v_delivery_date)) then
        continue;
      end if;

      if not (select private.automatic_supplement_is_due(
        v_provider.id,
        v_order_date,
        v_delivery_date,
        now()
      )) then
        continue;
      end if;

      if exists (
        select 1
        from public.provider_late_order_dispatches pld
        where pld.provider_id = v_provider.id
          and pld.scheduled_delivery_date = v_delivery_date
          and pld.status in ('pending', 'attention_required')
      ) then
        continue;
      end if;

      v_batches := v_batches || jsonb_build_array(
        jsonb_build_object(
          'provider_id', v_provider.id,
          'scheduled_delivery_date', v_delivery_date,
          'order_date', v_order_date
        )
      );
    end loop;
  end loop;

  return v_batches;
end;
$$;

create or replace function private.maybe_materialize_current_weekday_snapshot(
  p_provider_id uuid,
  p_affected_weekday smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date := private.jamaica_today_date();
  v_order_weekday smallint;
begin
  v_order_weekday := public.iso_weekday(v_order_date);

  if not public.is_business_day(v_order_date, null)
     or v_order_weekday is null
     or p_affected_weekday is distinct from v_order_weekday then
    return;
  end if;

  if exists (
    select 1
    from public.lunch_days ld
    where ld.provider_id = p_provider_id
      and ld.order_date = v_order_date
  ) then
    return;
  end if;

  perform private.ensure_provider_lunch_day(p_provider_id, v_order_date);
end;
$$;
