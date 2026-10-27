begin;

-- Bounded directory search for the HR late-order troubleshooting preview.
-- Company employee IDs and authentication metadata are intentionally excluded.
create or replace function public.search_hr_late_order_preview_employees(
  p_search text,
  p_limit integer default 20
)
returns table (
  profile_id uuid,
  full_name text,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := pg_catalog.btrim(coalesce(p_search, ''));
  v_normalized_search text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  if pg_catalog.char_length(v_search) < 2 then
    return;
  end if;

  v_normalized_search := private.normalize_employee_name_search(v_search);

  return query
  select
    p.id,
    p.full_name,
    u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.account_status = 'active'
    and not private.signup_onboarding_pending_for_profile(p.id)
    and u.email is not null
    and (
      pg_catalog.strpos(
        private.normalize_employee_name_search(coalesce(p.full_name, '')),
        v_normalized_search
      ) > 0
      or pg_catalog.strpos(pg_catalog.lower(u.email::text), pg_catalog.lower(v_search)) > 0
    )
  order by p.full_name nulls last, u.email, p.id
  limit v_limit;
end;
$$;

comment on function public.search_hr_late_order_preview_employees(text, integer) is
  'Bounded names/email search for permanent HR and active HR Support Mode late-order troubleshooting. Excludes company employee IDs.';

alter function public.search_hr_late_order_preview_employees(text, integer) owner to postgres;
revoke all on function public.search_hr_late_order_preview_employees(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.search_hr_late_order_preview_employees(text, integer)
to authenticated;

-- Genuinely read-only counterpart to fetch_hr_late_order_snapshot_menu().
-- It never calls ensure_provider_lunch_day() and never materializes menu rows.
create or replace function public.preview_hr_late_order_menu(
  p_provider_id uuid,
  p_delivery_date date,
  p_profile_id uuid default null,
  p_office_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_jamaica_today date := private.jamaica_today_date();
  v_lunch_day_id uuid;
  v_location_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_accepts boolean;
  v_has_snapshot_rows boolean := false;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_hr_operational_data()) then
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

  if p_profile_id is not null then
    select p.default_office_location_id
    into v_location_id
    from public.profiles p
    where p.id = p_profile_id
      and p.account_status = 'active'
      and not private.signup_onboarding_pending_for_profile(p.id);

    if not found then
      raise exception 'Employee is not available';
    end if;
  end if;

  if p_office_location_id is not null then
    select ol.id
    into v_location_id
    from public.office_locations ol
    where ol.id = p_office_location_id
      and ol.is_active = true;

    if not found then
      raise exception 'Delivery location is not available';
    end if;
  end if;

  v_order_date := public.order_date_for_delivery_date(p_delivery_date, v_location_id);

  if v_order_date is null
     or public.delivery_date_for_order_date(v_order_date, v_location_id) <> p_delivery_date then
    return jsonb_build_object(
      'status', 'invalid_cycle',
      'order_date', null,
      'delivery_date', p_delivery_date,
      'menu_items', '[]'::jsonb
    );
  end if;

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(p_provider_id, v_order_date);

  if v_lunch_day_id is not null then
    select exists (
      select 1
      from public.menu_items mi
      where mi.lunch_day_id = v_lunch_day_id
    ) into v_has_snapshot_rows;
  end if;

  if v_lunch_day_id is not null and (v_has_snapshot_rows or v_order_date <> v_jamaica_today) then
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
        ) order by mi.item_type, mi.name, mi.id
      ),
      '[]'::jsonb
    )
    into v_items
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.is_active = true;
  elsif v_order_date = v_jamaica_today then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', pmi.id,
          'name', pmi.name,
          'description', pmi.description,
          'price', pmi.price,
          'item_type', pmi.item_type,
          'unit_label', pmi.unit_label,
          'display_category', pmi.display_category
        ) order by pmi.item_type, pmi.name, pmi.id
      ),
      '[]'::jsonb
    )
    into v_items
    from public.provider_menu_items pmi
    join public.provider_menu_item_weekdays pmw
      on pmw.provider_menu_item_id = pmi.id
    where pmi.provider_id = p_provider_id
      and pmi.active = true
      and pmw.weekday = public.iso_weekday(v_order_date);
  elsif v_order_date < v_jamaica_today then
    return jsonb_build_object(
      'status', 'historical_unavailable',
      'order_date', v_order_date,
      'delivery_date', p_delivery_date,
      'menu_items', '[]'::jsonb
    );
  else
    return jsonb_build_object(
      'status', 'future_unavailable',
      'order_date', v_order_date,
      'delivery_date', p_delivery_date,
      'menu_items', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'status', 'available',
    'order_date', v_order_date,
    'delivery_date', p_delivery_date,
    'menu_items', v_items
  );
end;
$$;

comment on function public.preview_hr_late_order_menu(uuid, date, uuid, uuid) is
  'Read-only late-order menu preview for permanent HR and active HR Support Mode. Never materializes lunch days, menus, orders, dispatches, notifications, or audit events.';

alter function public.preview_hr_late_order_menu(uuid, date, uuid, uuid) owner to postgres;
revoke all on function public.preview_hr_late_order_menu(uuid, date, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.preview_hr_late_order_menu(uuid, date, uuid, uuid)
to authenticated;

commit;
