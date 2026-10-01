-- Authoritative Business Calendar closure metadata for staff-facing ordering copy.

create or replace function private.business_calendar_effective_closure(
  p_date date,
  p_office_location_id uuid default null
)
returns table (
  is_open boolean,
  closure_entry_type text,
  closure_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_override_type text;
  v_name text;
begin
  if p_office_location_id is not null then
    select bce.entry_type, bce.name
    into v_override_type, v_name
    from private.business_calendar_entries bce
    where bce.calendar_date = p_date
      and bce.scope = 'location'
      and bce.office_location_id = p_office_location_id
      and bce.archived_at is null
      and bce.entry_type in ('override_open', 'override_closed')
    limit 1;

    if found then
      return query
      select
        v_override_type = 'override_open',
        case when v_override_type = 'override_closed' then v_override_type else null end,
        case when v_override_type = 'override_closed' then v_name else null end;
      return;
    end if;
  end if;

  select bce.entry_type, bce.name
  into v_override_type, v_name
  from private.business_calendar_entries bce
  where bce.calendar_date = p_date
    and bce.scope = 'global'
    and bce.archived_at is null
    and bce.entry_type in ('override_open', 'override_closed')
  limit 1;

  if found then
    return query
    select
      v_override_type = 'override_open',
      case when v_override_type = 'override_closed' then v_override_type else null end,
      case when v_override_type = 'override_closed' then v_name else null end;
    return;
  end if;

  if p_office_location_id is not null then
    select bce.entry_type, bce.name
    into v_override_type, v_name
    from private.business_calendar_entries bce
    where bce.calendar_date = p_date
      and bce.scope = 'location'
      and bce.office_location_id = p_office_location_id
      and bce.archived_at is null
      and bce.entry_type in ('public_holiday', 'company_closure')
    limit 1;

    if found then
      return query select false, v_override_type, v_name;
      return;
    end if;
  end if;

  select bce.entry_type, bce.name
  into v_override_type, v_name
  from private.business_calendar_entries bce
  where bce.calendar_date = p_date
    and bce.scope = 'global'
    and bce.archived_at is null
    and bce.entry_type in ('public_holiday', 'company_closure')
  limit 1;

  if found then
    return query select false, v_override_type, v_name;
    return;
  end if;

  if extract(isodow from p_date)::int in (6, 7) then
    return query select false, null::text, null::text;
    return;
  end if;

  return query select true, null::text, null::text;
end;
$$;

revoke all on function private.business_calendar_effective_closure(date, uuid) from public;

create or replace function public.get_business_day_ordering_closure(
  p_date date,
  p_office_location_id uuid default null
)
returns table (
  is_business_day boolean,
  closure_entry_type text,
  closure_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ec.is_open,
    ec.closure_entry_type,
    ec.closure_name
  from private.business_calendar_effective_closure(p_date, p_office_location_id) ec;
$$;

revoke all on function public.get_business_day_ordering_closure(date, uuid) from public;
grant execute on function public.get_business_day_ordering_closure(date, uuid) to authenticated;
