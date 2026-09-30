-- Business calendar: authoritative open/closed days for lunch operations.

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table private.business_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  calendar_date date not null,
  entry_type text not null,
  scope text not null,
  office_location_id uuid references public.office_locations(id) on delete restrict,
  name text not null,
  notes text,
  source text not null default 'manual',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint business_calendar_entries_entry_type_check
    check (entry_type in (
      'public_holiday',
      'company_closure',
      'override_open',
      'override_closed'
    )),
  constraint business_calendar_entries_scope_check
    check (scope in ('global', 'location')),
  constraint business_calendar_entries_source_check
    check (source in ('official', 'manual')),
  constraint business_calendar_entries_scope_location_check
    check (
      (scope = 'global' and office_location_id is null)
      or (scope = 'location' and office_location_id is not null)
    )
);

-- One active closure and one active override may coexist per date/scope/location.
create unique index business_calendar_entries_active_closure_unique_idx
  on private.business_calendar_entries (calendar_date, scope, office_location_id)
  nulls not distinct
  where archived_at is null
    and entry_type in ('public_holiday', 'company_closure');

create unique index business_calendar_entries_active_override_unique_idx
  on private.business_calendar_entries (calendar_date, scope, office_location_id)
  nulls not distinct
  where archived_at is null
    and entry_type in ('override_open', 'override_closed');

create index business_calendar_entries_year_idx
  on private.business_calendar_entries (calendar_date)
  where archived_at is null;

create table private.business_calendar_entry_audit (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references private.business_calendar_entries(id) on delete cascade,
  action text not null,
  old_record jsonb,
  new_record jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create trigger business_calendar_entries_set_updated_at
  before update on private.business_calendar_entries
  for each row
  execute function private.set_updated_at();

revoke all on private.business_calendar_entries from public, anon, authenticated;
revoke all on private.business_calendar_entry_audit from public, anon, authenticated;

-- ------------------------------------------------------------
-- Effective open/closed (precedence)
-- ------------------------------------------------------------

create or replace function private.business_calendar_day_open(
  p_date date,
  p_office_location_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_override_type text;
begin
  if p_office_location_id is not null then
    select bce.entry_type
    into v_override_type
    from private.business_calendar_entries bce
    where bce.calendar_date = p_date
      and bce.scope = 'location'
      and bce.office_location_id = p_office_location_id
      and bce.archived_at is null
      and bce.entry_type in ('override_open', 'override_closed')
    limit 1;

    if found then
      return v_override_type = 'override_open';
    end if;
  end if;

  select bce.entry_type
  into v_override_type
  from private.business_calendar_entries bce
  where bce.calendar_date = p_date
    and bce.scope = 'global'
    and bce.archived_at is null
    and bce.entry_type in ('override_open', 'override_closed')
  limit 1;

  if found then
    return v_override_type = 'override_open';
  end if;

  if p_office_location_id is not null then
    if exists (
      select 1
      from private.business_calendar_entries bce
      where bce.calendar_date = p_date
        and bce.scope = 'location'
        and bce.office_location_id = p_office_location_id
        and bce.archived_at is null
        and bce.entry_type in ('public_holiday', 'company_closure')
    ) then
      return false;
    end if;
  end if;

  if exists (
    select 1
    from private.business_calendar_entries bce
    where bce.calendar_date = p_date
      and bce.scope = 'global'
      and bce.archived_at is null
      and bce.entry_type in ('public_holiday', 'company_closure')
  ) then
    return false;
  end if;

  if extract(isodow from p_date)::int in (6, 7) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.business_calendar_day_open(date, uuid) from public;
grant execute on function private.business_calendar_day_open(date, uuid) to authenticated;

create or replace function public.is_business_day(
  p_date date,
  p_office_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.business_calendar_day_open(p_date, p_office_location_id);
$$;

revoke all on function public.is_business_day(date, uuid) from public;
grant execute on function public.is_business_day(date, uuid) to authenticated;

create or replace function public.next_business_day(
  p_date date,
  p_office_location_id uuid default null
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cursor date := p_date + 1;
  v_guard integer := 0;
begin
  loop
    v_guard := v_guard + 1;

    if v_guard > 400 then
      return null;
    end if;

    if public.is_business_day(v_cursor, p_office_location_id) then
      return v_cursor;
    end if;

    v_cursor := v_cursor + 1;
  end loop;
end;
$$;

revoke all on function public.next_business_day(date, uuid) from public;
grant execute on function public.next_business_day(date, uuid) to authenticated;

create or replace function public.previous_business_day(
  p_date date,
  p_office_location_id uuid default null
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cursor date := p_date - 1;
  v_guard integer := 0;
begin
  loop
    v_guard := v_guard + 1;

    if v_guard > 400 then
      return null;
    end if;

    if public.is_business_day(v_cursor, p_office_location_id) then
      return v_cursor;
    end if;

    v_cursor := v_cursor - 1;
  end loop;
end;
$$;

revoke all on function public.previous_business_day(date, uuid) from public;
grant execute on function public.previous_business_day(date, uuid) to authenticated;

-- ------------------------------------------------------------
-- Delivery / order date helpers (global default overload)
-- ------------------------------------------------------------

create or replace function public.delivery_date_for_order_date(
  p_order_date date,
  p_office_location_id uuid default null
)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when p_order_date is null then null
    when public.is_business_day(p_order_date, p_office_location_id)
      then public.next_business_day(p_order_date, p_office_location_id)
    else null
  end;
$$;

drop function if exists public.delivery_date_for_order_date(date);

revoke all on function public.delivery_date_for_order_date(date, uuid) from public;
grant execute on function public.delivery_date_for_order_date(date, uuid) to authenticated;

create or replace function public.order_date_for_delivery_date(
  p_delivery_date date,
  p_office_location_id uuid default null
)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when p_delivery_date is null then null
    when public.is_business_day(p_delivery_date, p_office_location_id)
      then public.previous_business_day(p_delivery_date, p_office_location_id)
    else null
  end;
$$;

drop function if exists public.order_date_for_delivery_date(date);

revoke all on function public.order_date_for_delivery_date(date, uuid) from public;
grant execute on function public.order_date_for_delivery_date(date, uuid) to authenticated;

-- ------------------------------------------------------------
-- Ordering enforcement helper
-- ------------------------------------------------------------

create or replace function private.assert_order_date_allows_ordering(
  p_order_date date,
  p_office_location_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_business_day(p_order_date, p_office_location_id) then
    raise exception 'Ordering is not available on this date';
  end if;
end;
$$;

revoke all on function private.assert_order_date_allows_ordering(date, uuid) from public;

-- ------------------------------------------------------------
-- Audit helper
-- ------------------------------------------------------------

create or replace function private.audit_business_calendar_entry_change(
  p_entry_id uuid,
  p_action text,
  p_old jsonb,
  p_new jsonb,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.business_calendar_entry_audit (
    entry_id,
    action,
    old_record,
    new_record,
    changed_by
  )
  values (p_entry_id, p_action, p_old, p_new, p_actor);
end;
$$;

revoke all on function private.audit_business_calendar_entry_change(uuid, text, jsonb, jsonb, uuid)
from public;

-- ------------------------------------------------------------
-- HR read / mutate RPCs
-- ------------------------------------------------------------

create or replace function public.list_business_calendar_entries(
  p_year integer,
  p_search text default null,
  p_entry_type text default null
)
returns table (
  id uuid,
  calendar_date date,
  day_label text,
  name text,
  entry_type text,
  scope text,
  office_location_id uuid,
  office_location_name text,
  effective_open boolean,
  source text,
  notes text,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_view_hr_operational_data()) then
    raise exception 'Not authorized to view business calendar';
  end if;

  return query
  select
    bce.id,
    bce.calendar_date,
    to_char(bce.calendar_date, 'Dy') as day_label,
    bce.name,
    bce.entry_type,
    bce.scope,
    bce.office_location_id,
    ol.name as office_location_name,
    private.business_calendar_day_open(bce.calendar_date, null) as effective_open,
    bce.source,
    bce.notes,
    bce.archived_at
  from private.business_calendar_entries bce
  left join public.office_locations ol on ol.id = bce.office_location_id
  where bce.archived_at is null
    and extract(year from bce.calendar_date)::int = p_year
    and (
      p_entry_type is null
      or bce.entry_type = p_entry_type
    )
    and (
      p_search is null
      or length(trim(p_search)) = 0
      or bce.name ilike '%' || trim(p_search) || '%'
      or bce.notes ilike '%' || trim(p_search) || '%'
    )
  order by bce.calendar_date asc, bce.scope desc, bce.name asc;
end;
$$;

revoke all on function public.list_business_calendar_entries(integer, text, text) from public;
grant execute on function public.list_business_calendar_entries(integer, text, text) to authenticated;

create or replace function public.upsert_manual_business_calendar_entry(
  p_id uuid,
  p_calendar_date date,
  p_entry_type text,
  p_scope text,
  p_office_location_id uuid,
  p_name text,
  p_notes text
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
         or v_existing.office_location_id is distinct from p_office_location_id then
        raise exception 'Historical calendar entries cannot change date, type, or scope';
      end if;
    end if;

    v_old := to_jsonb(v_existing);

    update private.business_calendar_entries
    set
      calendar_date = p_calendar_date,
      entry_type = p_entry_type,
      scope = p_scope,
      office_location_id = case when p_scope = 'global' then null else p_office_location_id end,
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
    case when p_scope = 'global' then null else p_office_location_id end,
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

revoke all on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text)
from public;
grant execute on function public.upsert_manual_business_calendar_entry(uuid, date, text, text, uuid, text, text)
to authenticated;

create or replace function public.archive_business_calendar_entry(p_id uuid)
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
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'Not authorized to manage business calendar';
  end if;

  perform private.expire_stale_support_sessions();

  select *
  into v_existing
  from private.business_calendar_entries
  where id = p_id
  for update;

  if not found then
    raise exception 'Calendar entry not found';
  end if;

  if v_existing.archived_at is not null then
    return;
  end if;

  if v_existing.source = 'official' then
    raise exception 'Official holidays cannot be archived; add an override instead';
  end if;

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
end;
$$;

revoke all on function public.archive_business_calendar_entry(uuid) from public;
grant execute on function public.archive_business_calendar_entry(uuid) to authenticated;

-- Idempotent official holiday seeding (production dates supplied separately).
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

  -- Verified Jamaica public-holiday dates are not bundled in this migration.
  return 0;
end;
$$;

revoke all on function public.seed_official_business_calendar_year(integer) from public;
grant execute on function public.seed_official_business_calendar_year(integer) to authenticated;

-- ------------------------------------------------------------
-- Ordering paths: business-day enforcement
-- ------------------------------------------------------------

create or replace function private.ensure_provider_lunch_day(
  p_provider_id uuid,
  p_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_date date;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
begin
  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  perform private.assert_order_date_allows_ordering(p_order_date, null);

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on this date';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where provider_id = p_provider_id
    and order_date = p_order_date;

  if found then
    if p_order_date = private.jamaica_today_date()
       and not exists (
         select 1
         from public.menu_items mi
         where mi.lunch_day_id = v_lunch_day_id
       )
    then
      insert into public.menu_items (
        lunch_day_id,
        provider_menu_item_id,
        name,
        description,
        price,
        item_type,
        unit_label,
        display_category,
        is_active
      )
      select
        v_lunch_day_id,
        pmi.id,
        pmi.name,
        pmi.description,
        pmi.price,
        pmi.item_type,
        pmi.unit_label,
        pmi.display_category,
        true
      from public.provider_menu_items pmi
      join public.provider_menu_item_weekdays pmw
        on pmw.provider_menu_item_id = pmi.id
      where pmi.provider_id = p_provider_id
        and pmi.active = true
        and pmw.weekday = v_order_weekday;
    end if;

    return v_lunch_day_id;
  end if;

  v_delivery_date := public.delivery_date_for_order_date(p_order_date);

  if v_delivery_date is null then
    raise exception 'Unable to determine delivery date';
  end if;

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  insert into public.lunch_days (
    lunch_date,
    order_date,
    provider_id,
    order_deadline,
    status
  )
  values (
    v_delivery_date,
    p_order_date,
    p_provider_id,
    v_deadline,
    'open'
  )
  returning id into v_lunch_day_id;

  insert into public.menu_items (
    lunch_day_id,
    provider_menu_item_id,
    name,
    description,
    price,
    item_type,
    unit_label,
    display_category,
    is_active
  )
  select
    v_lunch_day_id,
    pmi.id,
    pmi.name,
    pmi.description,
    pmi.price,
    pmi.item_type,
    pmi.unit_label,
    pmi.display_category,
    true
  from public.provider_menu_items pmi
  join public.provider_menu_item_weekdays pmw
    on pmw.provider_menu_item_id = pmi.id
  where pmi.provider_id = p_provider_id
    and pmi.active = true
    and pmw.weekday = v_order_weekday;

  return v_lunch_day_id;
end;
$$;

create or replace function private.insert_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid,
  p_order_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  v_meal_quantity := private.validate_provider_order_payload(
    p_provider_id,
    p_items
  );

  v_items := private.build_provider_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  perform private.assert_order_date_allows_ordering(p_order_date, v_location_id);

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on this date';
  end if;

  v_special_instructions :=
    private.normalize_special_instructions(p_special_instructions);

  if p_special_instructions is not null
     and length(trim(p_special_instructions)) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.validate_order_date_not_in_finalized_period(p_order_date);

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  v_lunch_day_id := private.ensure_provider_lunch_day(
    p_provider_id,
    p_order_date
  );

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_provider_menu_item_id :=
        (v_item ->> 'provider_menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id
      and mi.is_active = true;

    if not found then
      raise exception
        'Menu item % for provider % is invalid or inactive on lunch day %',
        v_provider_menu_item_id,
        p_provider_id,
        v_lunch_day_id;
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    special_instructions,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address,
    order_group_id
  )
  values (
    v_actor,
    v_lunch_day_id,
    v_special_instructions,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address,
    p_order_group_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    v_provider_menu_item_id :=
      (v_item ->> 'provider_menu_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_order_date date;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  select ld.order_date
  into v_order_date
  from public.lunch_days ld
  where ld.id = p_lunch_day_id;

  if not found then
    raise exception 'Lunch day does not exist';
  end if;

  perform private.assert_order_date_allows_ordering(v_order_date, v_location_id);

  v_meal_quantity := private.validate_snapshot_order_payload(
    p_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address
  )
  values (
    v_actor,
    p_lunch_day_id,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_update_instructions boolean := p_special_instructions is not null;
  v_current_location_id uuid;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_order_date date;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be edited';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);
  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id), ld.order_date
  into v_day_status, v_deadline, v_order_date
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  select office_location_id
  into v_current_location_id
  from public.orders
  where id = p_order_id;

  v_location_id := coalesce(p_office_location_id, v_current_location_id);

  perform private.assert_order_date_allows_ordering(v_order_date, v_location_id);

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(
    v_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if v_update_instructions then
    v_special_instructions :=
      private.normalize_special_instructions(p_special_instructions);

    if length(trim(coalesce(p_special_instructions, ''))) > 0
       and v_special_instructions is null then
      raise exception 'Special instructions are too long';
    end if;
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  if p_office_location_id is not null
     and p_office_location_id is distinct from v_current_location_id then
    select *
    into v_location_id, v_location_name, v_location_address
    from private.resolve_active_office_location_snapshot(p_office_location_id);

    update public.orders
    set
      meal_quantity = v_meal_quantity,
      office_location_id = v_location_id,
      office_location_name = v_location_name,
      office_location_address = v_location_address
    where id = p_order_id;
  else
    update public.orders
    set meal_quantity = v_meal_quantity
    where id = p_order_id;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;

  if v_update_instructions then
    update public.orders
    set special_instructions = v_special_instructions
    where id = p_order_id;
  end if;
end;
$$;
