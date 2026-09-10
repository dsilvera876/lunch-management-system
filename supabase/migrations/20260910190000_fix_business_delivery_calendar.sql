-- Correct next-business-day delivery calendar (Mon–Thu +1, Fri +3, weekend NULL).

create or replace function public.delivery_date_for_order_date(p_order_date date)
returns date
language sql
immutable
strict
set search_path = ''
as $$
  select case extract(isodow from p_order_date)::int
    when 1 then p_order_date + 1
    when 2 then p_order_date + 1
    when 3 then p_order_date + 1
    when 4 then p_order_date + 1
    when 5 then p_order_date + 3
    else null
  end;
$$;

revoke all on function public.delivery_date_for_order_date(date) from public;
grant execute on function public.delivery_date_for_order_date(date) to authenticated;

create or replace function public.order_date_for_delivery_date(p_delivery_date date)
returns date
language sql
immutable
strict
set search_path = ''
as $$
  select case extract(isodow from p_delivery_date)::int
    when 1 then p_delivery_date - 3
    when 2 then p_delivery_date - 1
    when 3 then p_delivery_date - 1
    when 4 then p_delivery_date - 1
    when 5 then p_delivery_date - 1
    else null
  end;
$$;

revoke all on function public.order_date_for_delivery_date(date) from public;
grant execute on function public.order_date_for_delivery_date(date) to authenticated;

-- Authoritative lookup by provider + order_date (never reuse lunch_date alone).
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

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where provider_id = p_provider_id
    and order_date = p_order_date;

  if found then
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

revoke execute on function private.ensure_provider_lunch_day(uuid, date)
from public, anon, authenticated;

-- Repair provider lunch_days whose lunch_date drifted under the old calendar bug.
do $$
declare
  v_row record;
  v_expected date;
  v_conflict uuid;
begin
  for v_row in
    select id, provider_id, order_date, lunch_date
    from public.lunch_days
    where provider_id is not null
      and order_date is not null
    order by order_date asc, provider_id asc
  loop
    v_expected := public.delivery_date_for_order_date(v_row.order_date);

    if v_expected is null or v_row.lunch_date = v_expected then
      continue;
    end if;

    select ld.id
    into v_conflict
    from public.lunch_days ld
    where ld.provider_id = v_row.provider_id
      and ld.lunch_date = v_expected
      and ld.id <> v_row.id
    limit 1;

    if v_conflict is not null then
      raise exception
        'Cannot repair lunch_day % (provider %, order_date %): destination lunch_date % already used by %',
        v_row.id,
        v_row.provider_id,
        v_row.order_date,
        v_expected,
        v_conflict;
    end if;

    update public.lunch_days
    set lunch_date = v_expected,
        updated_at = now()
    where id = v_row.id;
  end loop;
end;
$$;
