-- Read-only HR snapshot menu for the late-order builder (same lookup/ensure rules as create_hr_late_order).

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

revoke execute on function public.fetch_hr_late_order_snapshot_menu(uuid, date)
from public, anon;

grant execute on function public.fetch_hr_late_order_snapshot_menu(uuid, date)
to authenticated;
