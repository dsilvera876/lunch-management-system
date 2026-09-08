-- ============================================================
-- Add display_category to menu items
-- ============================================================

alter table public.provider_menu_items
add column display_category text;

alter table public.menu_items
add column display_category text;

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

  v_delivery_date := public.delivery_date_for_order_date(p_order_date);

  if v_delivery_date is null then
    raise exception 'Unable to determine delivery date';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where lunch_date = v_delivery_date
    and provider_id = p_provider_id;

  if found then
    return v_lunch_day_id;
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

-- This internal snapshot helper is invoked by trusted order RPCs. Authenticated
-- application users must not call it directly to create lunch-day snapshots.
revoke execute
on function private.ensure_provider_lunch_day(uuid, date)
from public, anon, authenticated;
