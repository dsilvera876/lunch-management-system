-- Reuse existing provider lunch_days by delivery date and make creation concurrency-safe.
-- Prevents duplicate-key violations on lunch_days_provider_delivery_unique during checkout.

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
  v_created_new_row boolean := false;
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

  select id
  into v_lunch_day_id
  from public.lunch_days
  where provider_id = p_provider_id
    and lunch_date = v_delivery_date;

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
  on conflict (lunch_date, provider_id) where provider_id is not null
  do nothing
  returning id into v_lunch_day_id;

  if v_lunch_day_id is null then
    select id
    into v_lunch_day_id
    from public.lunch_days
    where provider_id = p_provider_id
      and lunch_date = v_delivery_date;
  else
    v_created_new_row := true;
  end if;

  if v_lunch_day_id is null then
    raise exception 'Unable to resolve provider lunch day';
  end if;

  if v_created_new_row
     or (
       p_order_date = private.jamaica_today_date()
       and not exists (
         select 1
         from public.menu_items mi
         where mi.lunch_day_id = v_lunch_day_id
       )
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
end;
$$;

revoke execute on function private.ensure_provider_lunch_day(uuid, date)
from public, anon, authenticated;
