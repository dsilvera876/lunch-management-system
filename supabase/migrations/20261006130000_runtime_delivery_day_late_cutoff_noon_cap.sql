-- Cap delivery-day late-order deadlines at 12:00 PM Jamaica time at runtime (legacy rows included).

create or replace function private.effective_late_order_deadline_time(
  p_deadline_day text,
  p_deadline_time time
)
returns time
language sql
immutable
set search_path = ''
as $$
  select case
    when p_deadline_day = 'delivery_day'
         and p_deadline_time is not null
         and p_deadline_time > time '12:00:00'
    then time '12:00:00'
    else p_deadline_time
  end;
$$;

revoke all on function private.effective_late_order_deadline_time(text, time) from public;

create or replace function public.provider_late_order_deadline_at(
  p_provider_id uuid,
  p_order_date date,
  p_delivery_date date
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select public.provider_late_order_anchor_at(
    lp.late_order_deadline_day,
    private.effective_late_order_deadline_time(
      lp.late_order_deadline_day,
      lp.late_order_deadline_time
    ),
    p_order_date,
    p_delivery_date
  )
  from public.lunch_providers lp
  where lp.id = p_provider_id;
$$;

create or replace function private.automatic_supplement_is_due(
  p_provider_id uuid,
  p_order_date date,
  p_delivery_date date,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider record;
  v_send_at timestamptz;
  v_deadline timestamptz;
begin
  select
    lp.supplemental_dispatch_mode,
    lp.accepts_late_orders,
    lp.automatic_supplement_send_day,
    lp.automatic_supplement_send_time,
    lp.late_order_deadline_day,
    lp.late_order_deadline_time,
    lp.primary_order_email
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not found
     or v_provider.supplemental_dispatch_mode <> 'automatic'
     or not coalesce(v_provider.accepts_late_orders, false)
     or v_provider.automatic_supplement_send_day is null
     or v_provider.automatic_supplement_send_time is null
     or v_provider.late_order_deadline_day is null
     or v_provider.late_order_deadline_time is null
     or v_provider.primary_order_email is null
     or length(trim(v_provider.primary_order_email)) = 0 then
    return false;
  end if;

  v_send_at := public.provider_late_order_anchor_at(
    v_provider.automatic_supplement_send_day,
    v_provider.automatic_supplement_send_time,
    p_order_date,
    p_delivery_date
  );
  v_deadline := public.provider_late_order_anchor_at(
    v_provider.late_order_deadline_day,
    private.effective_late_order_deadline_time(
      v_provider.late_order_deadline_day,
      v_provider.late_order_deadline_time
    ),
    p_order_date,
    p_delivery_date
  );

  if v_send_at is null or v_deadline is null then
    return false;
  end if;

  return p_now >= v_send_at and p_now <= v_deadline;
end;
$$;

create or replace function private.claim_provider_late_order_supplement_core(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_dispatch_type text,
  p_created_by uuid,
  p_worker_source text,
  p_require_automatic_due boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_provider record;
  v_dispatch_id uuid;
  v_order_ids uuid[];
  v_deadline timestamptz;
  v_send_at timestamptz;
  v_blocking_status text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_provider_id::text || ':' || p_scheduled_delivery_date::text, 0)
  );

  select pld.status
  into v_blocking_status
  from public.provider_late_order_dispatches pld
  where pld.provider_id = p_provider_id
    and pld.scheduled_delivery_date = p_scheduled_delivery_date
    and pld.status in ('pending', 'attention_required')
  order by pld.created_at desc
  limit 1;

  if v_blocking_status = 'pending' then
    raise exception 'Supplement dispatch already in progress';
  end if;

  if v_blocking_status = 'attention_required' then
    raise exception 'Dispatch requires HR review before retry';
  end if;

  select
    lp.primary_order_email,
    lp.accepts_late_orders,
    lp.supplemental_dispatch_mode,
    lp.late_order_deadline_day,
    lp.late_order_deadline_time,
    lp.automatic_supplement_send_day,
    lp.automatic_supplement_send_time
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not found then
    raise exception 'Provider is not available';
  end if;

  if not coalesce(v_provider.accepts_late_orders, false) then
    raise exception 'Provider does not accept late orders';
  end if;

  if v_provider.primary_order_email is null
     or length(trim(v_provider.primary_order_email)) = 0 then
    raise exception 'Provider order email is not configured';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date);

  if v_order_date is null then
    raise exception 'Invalid delivery date';
  end if;

  v_deadline := public.provider_late_order_anchor_at(
    v_provider.late_order_deadline_day,
    private.effective_late_order_deadline_time(
      v_provider.late_order_deadline_day,
      v_provider.late_order_deadline_time
    ),
    v_order_date,
    p_scheduled_delivery_date
  );

  if v_deadline is null then
    raise exception 'Provider late-order deadline is not configured';
  end if;

  if now() > v_deadline then
    raise exception 'Provider late-order deadline has passed';
  end if;

  if p_require_automatic_due then
    if v_provider.supplemental_dispatch_mode <> 'automatic' then
      raise exception 'Provider is not configured for automatic supplemental dispatch';
    end if;

    if not (select private.automatic_supplement_is_due(
      p_provider_id,
      v_order_date,
      p_scheduled_delivery_date,
      now()
    )) then
      raise exception 'Automatic supplement send time has not been reached or deadline has passed';
    end if;

    v_send_at := public.provider_automatic_supplement_send_at(
      p_provider_id,
      v_order_date,
      p_scheduled_delivery_date
    );
  else
    v_send_at := null;
  end if;

  v_order_ids := private.eligible_unsent_late_order_ids(
    p_provider_id,
    p_scheduled_delivery_date
  );

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    raise exception 'No approved unsent late orders for this provider and delivery date';
  end if;

  insert into public.provider_late_order_dispatches (
    provider_id,
    scheduled_delivery_date,
    dispatch_type,
    status,
    created_by,
    provider_email,
    message_metadata,
    configured_send_at,
    lease_expires_at,
    worker_source
  )
  values (
    p_provider_id,
    p_scheduled_delivery_date,
    p_dispatch_type,
    'pending',
    p_created_by,
    v_provider.primary_order_email,
    jsonb_build_object('order_ids', to_jsonb(v_order_ids)),
    v_send_at,
    now() + interval '15 minutes',
    p_worker_source
  )
  returning id into v_dispatch_id;

  return jsonb_build_object(
    'dispatch_id', v_dispatch_id,
    'provider_id', p_provider_id,
    'provider_email', v_provider.primary_order_email,
    'scheduled_delivery_date', p_scheduled_delivery_date,
    'order_date', v_order_date,
    'order_ids', to_jsonb(v_order_ids)
  );
end;
$$;
