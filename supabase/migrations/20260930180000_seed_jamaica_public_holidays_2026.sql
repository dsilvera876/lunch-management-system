-- Verified Jamaica public holidays for calendar year 2026 (operational dates only).
--
-- This Business Calendar stores dated operational closures. Rows here are company
-- non-working / public-holiday dates for lunch ordering, not a full legal commentary.
--
-- Statutory Public General Holidays (Holidays (Public General) Act — Schedule):
--   New Year's Day, Ash Wednesday, Easter Monday, National Labour Day, Emancipation Day,
--   Independence Day, National Heroes' Day, Boxing Day (Day after Christmas Day), and
--   other Schedule entries. Ash Wednesday and Easter Monday are Public General Holidays
--   under the Act; their calendar dates for a given year follow the Act's movable-date
--   rules and are derived deterministically for 2026 (2026-02-18 and 2026-04-06).
--
-- Good Friday and Christmas Day are public non-working holidays in Jamaica but are not
-- listed among the Schedule "Public General Holidays" in the same way; they are still
-- seeded here because they are official non-working days for this application.
--   Good Friday 2026-04-03: aligned with Jamaica Information Service 2026 government
--   reporting around the holiday (e.g. JIS programming dated 2026-04-03 on Good Friday).
--   Easter Monday 2026-04-06: Public General Holiday under the Act (movable date above).
--
-- Section 2 observance notices (Ministry of Labour and Social Security via JIS):
--   Labour Day 2026 observed Monday 2026-05-25 (Saturday 2026-05-23 is NOT a holiday):
--   https://jis.gov.jm/observance-of-national-labour-day-2026/
--   Emancipation Day 2026 observed Saturday 2026-08-01 (NOT moved to Monday):
--   https://jis.gov.jm/emancipation-day-to-be-observed-on-saturday-august-1-2026/
--
-- Other 2026 dates on the Act Schedule or fixed calendar rules (no Section 2 move):
--   National Heroes' Day — third Monday in October (2026-10-19).
--   Christmas Day 2026-12-25 (Friday); Boxing Day 2026-12-26 (Saturday, observed Saturday
--   per Act / MLSS–JIS Saturday-holiday practice, not moved to Monday).
--
-- Official holiday occurrences must be verified and seeded per year; do not derive future
-- years by copying the prior year or applying a universal "weekend -> Monday" rule.

create or replace function private.insert_official_jamaica_public_holiday_if_absent(
  p_calendar_date date,
  p_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean := false;
begin
  if exists (
    select 1
    from private.business_calendar_entries bce
    where bce.archived_at is null
      and bce.scope = 'global'
      and bce.office_location_id is null
      and bce.calendar_date = p_calendar_date
      and bce.source = 'official'
      and bce.entry_type = 'public_holiday'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from private.business_calendar_entries bce
    where bce.archived_at is null
      and bce.scope = 'global'
      and bce.office_location_id is null
      and bce.calendar_date = p_calendar_date
      and bce.entry_type in ('public_holiday', 'company_closure')
  ) then
    return false;
  end if;

  insert into private.business_calendar_entries (
    calendar_date,
    entry_type,
    scope,
    office_location_id,
    name,
    source
  )
  values (
    p_calendar_date,
    'public_holiday',
    'global',
    null,
    p_name,
    'official'
  );

  v_inserted := true;
  return v_inserted;
end;
$$;

revoke all on function private.insert_official_jamaica_public_holiday_if_absent(date, text)
from public;

create or replace function private.business_calendar_impact_lunch_day_count(
  p_calendar_date date
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.lunch_days ld
  where ld.order_date = p_calendar_date
     or ld.lunch_date = p_calendar_date;
$$;

revoke all on function private.business_calendar_impact_lunch_day_count(date) from public;

create or replace function private.business_calendar_impact_submitted_order_count(
  p_calendar_date date,
  p_scope text,
  p_office_location_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.orders o
  inner join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.status = 'submitted'
    and (ld.order_date = p_calendar_date or ld.lunch_date = p_calendar_date)
    and (
      p_scope = 'global'
      or o.office_location_id is not distinct from p_office_location_id
    );
$$;

revoke all on function private.business_calendar_impact_submitted_order_count(date, text, uuid)
from public;

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

  v_lunch_day_count := private.business_calendar_impact_lunch_day_count(p_calendar_date);
  v_order_count := private.business_calendar_impact_submitted_order_count(
    p_calendar_date,
    p_scope,
    p_office_location_id
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

create or replace function private.seed_jamaica_official_public_holidays_2026()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_inserted integer := 0;
begin
  for v_row in
    select *
    from (
      values
        ('2026-01-01'::date, 'New Year''s Day'),
        ('2026-02-18'::date, 'Ash Wednesday'),
        ('2026-04-03'::date, 'Good Friday'),
        ('2026-04-06'::date, 'Easter Monday'),
        ('2026-05-25'::date, 'National Labour Day'),
        ('2026-08-01'::date, 'Emancipation Day'),
        ('2026-08-06'::date, 'Independence Day'),
        ('2026-10-19'::date, 'National Heroes'' Day'),
        ('2026-12-25'::date, 'Christmas Day'),
        ('2026-12-26'::date, 'Boxing Day')
    ) as holidays(calendar_date, name)
  loop
    if private.insert_official_jamaica_public_holiday_if_absent(
      v_row.calendar_date,
      v_row.name
    ) then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function private.seed_jamaica_official_public_holidays_2026() from public;

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

  if p_year = 2026 then
    return private.seed_jamaica_official_public_holidays_2026();
  end if;

  -- No verified official dataset for other years; do not invent dates.
  return 0;
end;
$$;

revoke all on function public.seed_official_business_calendar_year(integer) from public;
grant execute on function public.seed_official_business_calendar_year(integer) to authenticated;

select private.seed_jamaica_official_public_holidays_2026();
