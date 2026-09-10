-- ============================================================
-- Late-order background worker: snapshot materialization +
-- automatic supplemental dispatch (service-role RPCs)
-- ============================================================

alter table public.provider_late_order_dispatches
drop constraint if exists provider_late_order_dispatches_status_check;

alter table public.provider_late_order_dispatches
add constraint provider_late_order_dispatches_status_check
check (status in ('pending', 'sent', 'failed', 'attention_required'));

alter table public.provider_late_order_dispatches
add column if not exists configured_send_at timestamptz,
add column if not exists lease_expires_at timestamptz,
add column if not exists worker_source text
  check (worker_source is null or worker_source in ('manual_hr', 'automatic_worker')),
add column if not exists transport_metadata jsonb;

create or replace function private.is_worker_service_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.jwt() ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'service_role';
$$;

revoke all on function private.is_worker_service_caller() from public, anon, authenticated;

create or replace function private.assert_worker_service_caller()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Worker service access required';
  end if;
end;
$$;

revoke all on function private.assert_worker_service_caller() from public, anon, authenticated;

create or replace function private.eligible_unsent_late_order_ids(
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(o.id order by o.created_at), '{}'::uuid[])
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.is_late_order = true
    and ld.provider_id = p_provider_id
    and ld.lunch_date = p_scheduled_delivery_date
    and o.status = 'submitted'
    and not (select private.late_order_is_dispatched(o.id));
$$;

revoke all on function private.eligible_unsent_late_order_ids(uuid, date)
from public, anon, authenticated;

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
    v_provider.late_order_deadline_time,
    p_order_date,
    p_delivery_date
  );

  if v_send_at is null or v_deadline is null then
    return false;
  end if;

  return p_now >= v_send_at and p_now <= v_deadline;
end;
$$;

revoke all on function private.automatic_supplement_is_due(uuid, date, date, timestamptz)
from public, anon, authenticated;

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
    v_provider.late_order_deadline_time,
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

revoke all on function private.claim_provider_late_order_supplement_core(uuid, date, text, uuid, text, boolean)
from public, anon, authenticated;

create or replace function private.finalize_provider_late_order_supplement_core(
  p_dispatch_id uuid,
  p_success boolean,
  p_error_summary text default null,
  p_transport_metadata jsonb default null,
  p_attention_required boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch record;
  v_order_id uuid;
  v_order_ids jsonb;
begin
  select *
  into v_dispatch
  from public.provider_late_order_dispatches
  where id = p_dispatch_id
  for update;

  if not found then
    raise exception 'Dispatch not found';
  end if;

  if v_dispatch.status <> 'pending' then
    raise exception 'Dispatch is not pending';
  end if;

  v_order_ids := coalesce(v_dispatch.message_metadata -> 'order_ids', '[]'::jsonb);

  if p_attention_required then
    update public.provider_late_order_dispatches
    set status = 'attention_required',
        error_summary = left(
          coalesce(p_error_summary, 'Email delivery outcome uncertain; manual review required'),
          500
        ),
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;
    return;
  end if;

  if p_success then
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
        sent_at = now(),
        error_summary = null,
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;
  else
    update public.provider_late_order_dispatches
    set status = 'failed',
        error_summary = left(coalesce(p_error_summary, 'Email send failed'), 500),
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;
  end if;
end;
$$;

revoke all on function private.finalize_provider_late_order_supplement_core(uuid, boolean, text, jsonb, boolean)
from public, anon, authenticated;

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
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
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

drop function if exists public.finalize_provider_late_order_supplement(uuid, boolean, text);

create or replace function public.finalize_provider_late_order_supplement(
  p_dispatch_id uuid,
  p_success boolean,
  p_error_summary text default null,
  p_transport_metadata jsonb default null,
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
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
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

create or replace function public.resolve_provider_late_order_dispatch_attention(
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
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  update public.provider_late_order_dispatches
  set status = 'failed',
      error_summary = left(
        coalesce(error_summary, 'Reviewed and cleared for retry'),
        500
      )
  where id = p_dispatch_id
    and status = 'attention_required';

  if not found then
    raise exception 'Dispatch is not awaiting review';
  end if;
end;
$$;

revoke execute on function public.resolve_provider_late_order_dispatch_attention(uuid)
from public, anon;

grant execute on function public.resolve_provider_late_order_dispatch_attention(uuid)
to authenticated;

create or replace function public.worker_materialize_current_order_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date := private.jamaica_today_date();
  v_provider record;
  v_materialized integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  perform private.assert_worker_service_caller();

  if public.iso_weekday(v_order_date) is null then
    return jsonb_build_object(
      'order_date', v_order_date,
      'materialized', 0,
      'failures', '[]'::jsonb,
      'skipped', 'weekend'
    );
  end if;

  for v_provider in
    select id, name
    from public.lunch_providers
    where active = true
    order by name
  loop
    begin
      perform private.ensure_provider_lunch_day(v_provider.id, v_order_date);
      v_materialized := v_materialized + 1;
    exception
      when others then
        v_failures := v_failures || jsonb_build_array(
          jsonb_build_object(
            'provider_id', v_provider.id,
            'provider_name', v_provider.name,
            'error', left(sqlerrm, 500)
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'order_date', v_order_date,
    'materialized', v_materialized,
    'failures', v_failures
  );
end;
$$;

revoke execute on function public.worker_materialize_current_order_snapshots()
from public, anon, authenticated;

grant execute on function public.worker_materialize_current_order_snapshots()
to service_role;

create or replace function public.worker_sweep_stale_pending_dispatches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_worker_service_caller();

  update public.provider_late_order_dispatches
  set status = 'attention_required',
      error_summary = left(
        'Dispatch remained pending beyond lease; manual review required before retry.',
        500
      )
  where status = 'pending'
    and lease_expires_at is not null
    and lease_expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.worker_sweep_stale_pending_dispatches()
from public, anon, authenticated;

grant execute on function public.worker_sweep_stale_pending_dispatches()
to service_role;

create or replace function public.worker_list_due_automatic_supplement_batches()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batches jsonb := '[]'::jsonb;
  v_row record;
  v_order_date date;
begin
  perform private.assert_worker_service_caller();

  for v_row in
    select distinct
      ld.provider_id,
      ld.lunch_date as scheduled_delivery_date
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    join public.lunch_providers lp on lp.id = ld.provider_id
    where o.is_late_order = true
      and o.status = 'submitted'
      and lp.active = true
      and lp.supplemental_dispatch_mode = 'automatic'
      and lp.accepts_late_orders = true
      and not (select private.late_order_is_dispatched(o.id))
  loop
    v_order_date := public.order_date_for_delivery_date(v_row.scheduled_delivery_date);

    if v_order_date is null then
      continue;
    end if;

    if not (select private.automatic_supplement_is_due(
      v_row.provider_id,
      v_order_date,
      v_row.scheduled_delivery_date,
      now()
    )) then
      continue;
    end if;

    if exists (
      select 1
      from public.provider_late_order_dispatches pld
      where pld.provider_id = v_row.provider_id
        and pld.scheduled_delivery_date = v_row.scheduled_delivery_date
        and pld.status in ('pending', 'attention_required')
    ) then
      continue;
    end if;

    if coalesce(
      array_length(
        private.eligible_unsent_late_order_ids(
          v_row.provider_id,
          v_row.scheduled_delivery_date
        ),
        1
      ),
      0
    ) = 0 then
      continue;
    end if;

    v_batches := v_batches || jsonb_build_array(
      jsonb_build_object(
        'provider_id', v_row.provider_id,
        'scheduled_delivery_date', v_row.scheduled_delivery_date,
        'order_date', v_order_date
      )
    );
  end loop;

  return v_batches;
end;
$$;

revoke execute on function public.worker_list_due_automatic_supplement_batches()
from public, anon, authenticated;

grant execute on function public.worker_list_due_automatic_supplement_batches()
to service_role;

create or replace function public.worker_claim_automatic_provider_late_order_supplement(
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_worker_service_caller();

  return private.claim_provider_late_order_supplement_core(
    p_provider_id,
    p_scheduled_delivery_date,
    'automatic',
    null,
    'automatic_worker',
    true
  );
end;
$$;

revoke execute on function public.worker_claim_automatic_provider_late_order_supplement(uuid, date)
from public, anon, authenticated;

grant execute on function public.worker_claim_automatic_provider_late_order_supplement(uuid, date)
to service_role;

create or replace function public.worker_finalize_provider_late_order_supplement(
  p_dispatch_id uuid,
  p_success boolean,
  p_error_summary text default null,
  p_transport_metadata jsonb default null,
  p_attention_required boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_worker_service_caller();

  perform private.finalize_provider_late_order_supplement_core(
    p_dispatch_id,
    p_success,
    p_error_summary,
    p_transport_metadata,
    p_attention_required
  );
end;
$$;

revoke execute on function public.worker_finalize_provider_late_order_supplement(uuid, boolean, text, jsonb, boolean)
from public, anon, authenticated;

grant execute on function public.worker_finalize_provider_late_order_supplement(uuid, boolean, text, jsonb, boolean)
to service_role;

grant execute on function public.finalize_provider_late_order_supplement(uuid, boolean, text, jsonb, boolean)
to authenticated, service_role;
