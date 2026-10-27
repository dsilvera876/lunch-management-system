-- Keep HR Support Mode read-only at the database boundary.
-- Human dispatch mutations and snapshot materialization require permanent HR.

create or replace function public.claim_provider_late_order_supplement(
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  return private.claim_provider_late_order_supplement_core(
    p_provider_id,
    p_scheduled_delivery_date,
    'manual',
    v_actor,
    'manual_hr',
    false
  );
end;
$$;

create or replace function public.finalize_provider_late_order_supplement(
  p_dispatch_id uuid,
  p_success boolean,
  p_error_summary text default null::text,
  p_transport_metadata jsonb default null::jsonb,
  p_attention_required boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  perform private.finalize_provider_late_order_supplement_core(
    p_dispatch_id,
    p_success,
    p_error_summary,
    p_transport_metadata,
    p_attention_required
  );
end;
$$;

create or replace function public.acknowledge_provider_late_order_dispatch_not_received(
  p_dispatch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  update public.provider_late_order_dispatches
  set status = 'failed',
      error_summary = left(
        'HR confirmed provider did not receive email; retry allowed after provider confirmation.',
        500
      )
  where id = p_dispatch_id
    and status = 'attention_required';

  if not found then
    raise exception 'Dispatch is not awaiting review';
  end if;

  insert into public.provider_late_order_dispatch_reviews (
    dispatch_id,
    resolution,
    resolved_by,
    notes
  )
  values (
    p_dispatch_id,
    'confirmed_not_received',
    v_actor,
    'HR confirmed provider did not receive the supplemental email.'
  );
end;
$$;

create or replace function public.acknowledge_provider_late_order_dispatch_received(
  p_dispatch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_dispatch record;
  v_order_id uuid;
  v_order_ids jsonb;
  v_order_count integer := 0;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  select *
  into v_dispatch
  from public.provider_late_order_dispatches
  where id = p_dispatch_id
    and status = 'attention_required'
  for update;

  if not found then
    raise exception 'Dispatch is not awaiting review';
  end if;

  v_order_ids := coalesce(v_dispatch.message_metadata -> 'order_ids', '[]'::jsonb);
  v_order_count := jsonb_array_length(v_order_ids);

  for v_order_id in
    select value::uuid
    from jsonb_array_elements_text(v_order_ids)
  loop
    if not exists (
      select 1
      from public.orders o
      where o.id = v_order_id
        and o.is_late_order = true
        and o.status = 'submitted'
        and not (select private.late_order_is_dispatched(o.id))
    ) then
      raise exception 'Late order % is no longer eligible for dispatch', v_order_id;
    end if;

    insert into public.provider_late_order_dispatch_orders (
      dispatch_id,
      order_id
    )
    values (
      p_dispatch_id,
      v_order_id
    );
  end loop;

  update public.provider_late_order_dispatches
  set status = 'sent',
      sent_at = coalesce(sent_at, now()),
      error_summary = null
  where id = p_dispatch_id;

  perform private.finalize_automatic_opportunity_for_dispatch(
    p_dispatch_id,
    'sent',
    v_order_count
  );

  insert into public.provider_late_order_dispatch_reviews (
    dispatch_id,
    resolution,
    resolved_by,
    notes
  )
  values (
    p_dispatch_id,
    'confirmed_received',
    v_actor,
    'HR confirmed provider received the supplemental email without resending.'
  );
end;
$$;

create or replace function public.fetch_hr_late_order_snapshot_menu(
  p_provider_id uuid,
  p_delivery_date date,
  p_profile_id uuid default null
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
  v_location_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
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
    where p.id = p_profile_id;
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

-- Reassert the intended execution boundary. The five-argument human finalizer
-- historically retained PostgreSQL's default PUBLIC execute privilege.
revoke execute on function public.claim_provider_late_order_supplement(uuid, date)
from public, anon;
revoke execute on function public.finalize_provider_late_order_supplement(uuid, boolean, text, jsonb, boolean)
from public, anon;
revoke execute on function public.acknowledge_provider_late_order_dispatch_not_received(uuid)
from public, anon;
revoke execute on function public.acknowledge_provider_late_order_dispatch_received(uuid)
from public, anon;
revoke execute on function public.fetch_hr_late_order_snapshot_menu(uuid, date, uuid)
from public, anon;

grant execute on function public.claim_provider_late_order_supplement(uuid, date)
to authenticated;
grant execute on function public.finalize_provider_late_order_supplement(uuid, boolean, text, jsonb, boolean)
to authenticated, service_role;
grant execute on function public.acknowledge_provider_late_order_dispatch_not_received(uuid)
to authenticated;
grant execute on function public.acknowledge_provider_late_order_dispatch_received(uuid)
to authenticated;
grant execute on function public.fetch_hr_late_order_snapshot_menu(uuid, date, uuid)
to authenticated;
