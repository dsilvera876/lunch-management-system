-- Backfill menu rows when a current-order-day lunch_day exists but has no saved items yet.

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

create or replace function public.fetch_hr_late_order_snapshot_menu(
  p_provider_id uuid,
  p_delivery_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_jamaica_today date := private.jamaica_today_date();
  v_lunch_day_id uuid;
  v_items jsonb;
  v_accepts boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  select lp.accepts_late_orders
  into v_accepts
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not coalesce(v_accepts, false) then
    raise exception 'Provider does not accept late orders';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_delivery_date);

  if v_order_date is null
     or public.delivery_date_for_order_date(v_order_date) <> p_delivery_date then
    return jsonb_build_object(
      'status', 'invalid_cycle',
      'order_date', null,
      'delivery_date', p_delivery_date,
      'menu_items', '[]'::jsonb
    );
  end if;

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(
    p_provider_id,
    v_order_date
  );

  if v_lunch_day_id is null then
    if v_order_date < v_jamaica_today then
      return jsonb_build_object(
        'status', 'historical_unavailable',
        'order_date', v_order_date,
        'delivery_date', p_delivery_date,
        'menu_items', '[]'::jsonb
      );
    elsif v_order_date = v_jamaica_today then
      v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
    else
      return jsonb_build_object(
        'status', 'future_unavailable',
        'order_date', v_order_date,
        'delivery_date', p_delivery_date,
        'menu_items', '[]'::jsonb
      );
    end if;
  elsif v_order_date = v_jamaica_today then
    v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mi.id,
        'name', mi.name,
        'description', mi.description,
        'price', mi.price,
        'item_type', mi.item_type,
        'unit_label', mi.unit_label,
        'display_category', mi.display_category
      )
      order by mi.item_type, mi.name
    ),
    '[]'::jsonb
  )
  into v_items
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id
    and mi.is_active = true;

  return jsonb_build_object(
    'status', 'available',
    'order_date', v_order_date,
    'delivery_date', p_delivery_date,
    'menu_items', v_items
  );
end;
$$;
