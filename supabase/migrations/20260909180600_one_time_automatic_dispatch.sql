-- ============================================================
-- One-time automatic supplemental opportunity + review safety
-- ============================================================

create table public.provider_late_order_automatic_opportunities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.lunch_providers (id) on delete restrict,
  scheduled_delivery_date date not null,
  order_date date not null,
  configured_send_at timestamptz not null,
  processed_at timestamptz not null default now(),
  outcome text not null check (
    outcome in ('processing', 'sent', 'no_orders', 'failed', 'attention_required')
  ),
  dispatch_id uuid references public.provider_late_order_dispatches (id) on delete set null,
  late_order_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (provider_id, scheduled_delivery_date)
);

create index provider_late_order_automatic_opportunities_lookup_idx
on public.provider_late_order_automatic_opportunities (provider_id, scheduled_delivery_date);

alter table public.provider_late_order_automatic_opportunities enable row level security;

create policy "HR can view automatic late-order opportunities"
on public.provider_late_order_automatic_opportunities
for select
to authenticated
using ((select private.can_view_all_orders()));

revoke insert, update, delete on public.provider_late_order_automatic_opportunities
from authenticated;

create table public.provider_late_order_dispatch_reviews (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.provider_late_order_dispatches (id) on delete cascade,
  resolution text not null check (
    resolution in ('confirmed_not_received', 'confirmed_received')
  ),
  resolved_by uuid not null references public.profiles (id),
  resolved_at timestamptz not null default now(),
  notes text
);

create index provider_late_order_dispatch_reviews_dispatch_idx
on public.provider_late_order_dispatch_reviews (dispatch_id, resolved_at desc);

alter table public.provider_late_order_dispatch_reviews enable row level security;

create policy "HR can view late order dispatch reviews"
on public.provider_late_order_dispatch_reviews
for select
to authenticated
using ((select private.can_view_all_orders()));

revoke insert, update, delete on public.provider_late_order_dispatch_reviews
from authenticated;

create or replace function private.automatic_opportunity_exists(
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_late_order_automatic_opportunities o
    where o.provider_id = p_provider_id
      and o.scheduled_delivery_date = p_scheduled_delivery_date
  );
$$;

revoke all on function private.automatic_opportunity_exists(uuid, date)
from public, anon, authenticated;

create or replace function private.finalize_automatic_opportunity_for_dispatch(
  p_dispatch_id uuid,
  p_outcome text,
  p_late_order_count integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch record;
begin
  select *
  into v_dispatch
  from public.provider_late_order_dispatches
  where id = p_dispatch_id;

  if not found or v_dispatch.dispatch_type <> 'automatic' then
    return;
  end if;

  update public.provider_late_order_automatic_opportunities
  set outcome = p_outcome,
      processed_at = now(),
      dispatch_id = p_dispatch_id,
      late_order_count = coalesce(p_late_order_count, late_order_count)
  where provider_id = v_dispatch.provider_id
    and scheduled_delivery_date = v_dispatch.scheduled_delivery_date
    and outcome in ('processing', 'attention_required');
end;
$$;

revoke all on function private.finalize_automatic_opportunity_for_dispatch(uuid, text, integer)
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
  v_order_count integer := 0;
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
  v_order_count := jsonb_array_length(v_order_ids);

  if p_attention_required then
    update public.provider_late_order_dispatches
    set status = 'attention_required',
        error_summary = left(
          coalesce(p_error_summary, 'Email delivery outcome uncertain; manual review required'),
          500
        ),
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;

    perform private.finalize_automatic_opportunity_for_dispatch(
      p_dispatch_id,
      'attention_required',
      v_order_count
    );
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

    perform private.finalize_automatic_opportunity_for_dispatch(
      p_dispatch_id,
      'sent',
      v_order_count
    );
  else
    update public.provider_late_order_dispatches
    set status = 'failed',
        error_summary = left(coalesce(p_error_summary, 'Email send failed'), 500),
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;

    perform private.finalize_automatic_opportunity_for_dispatch(
      p_dispatch_id,
      'failed',
      v_order_count
    );
  end if;
end;
$$;

create or replace function private.process_automatic_supplement_opportunity(
  p_provider_id uuid,
  p_scheduled_delivery_date date
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
  v_send_at timestamptz;
  v_opportunity_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'auto-opportunity:' || p_provider_id::text || ':' || p_scheduled_delivery_date::text,
      0
    )
  );

  if (select private.automatic_opportunity_exists(p_provider_id, p_scheduled_delivery_date)) then
    raise exception 'Automatic supplement opportunity already processed';
  end if;

  select
    lp.primary_order_email,
    lp.accepts_late_orders,
    lp.supplemental_dispatch_mode,
    lp.late_order_deadline_day,
    lp.late_order_deadline_time
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not found
     or v_provider.supplemental_dispatch_mode <> 'automatic'
     or not coalesce(v_provider.accepts_late_orders, false) then
    raise exception 'Provider is not configured for automatic supplemental dispatch';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date);

  if v_order_date is null then
    raise exception 'Invalid delivery date';
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

  insert into public.provider_late_order_automatic_opportunities (
    provider_id,
    scheduled_delivery_date,
    order_date,
    configured_send_at,
    outcome,
    late_order_count
  )
  values (
    p_provider_id,
    p_scheduled_delivery_date,
    v_order_date,
    v_send_at,
    'processing',
    0
  )
  returning id into v_opportunity_id;

  v_order_ids := private.eligible_unsent_late_order_ids(
    p_provider_id,
    p_scheduled_delivery_date
  );

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    update public.provider_late_order_automatic_opportunities
    set outcome = 'no_orders',
        processed_at = now(),
        late_order_count = 0
    where id = v_opportunity_id;

    return jsonb_build_object(
      'action', 'no_orders',
      'provider_id', p_provider_id,
      'scheduled_delivery_date', p_scheduled_delivery_date,
      'opportunity_id', v_opportunity_id
    );
  end if;

  if exists (
    select 1
    from public.provider_late_order_dispatches pld
    where pld.provider_id = p_provider_id
      and pld.scheduled_delivery_date = p_scheduled_delivery_date
      and pld.status in ('pending', 'attention_required')
  ) then
    raise exception 'Supplement dispatch already in progress';
  end if;

  insert into public.provider_late_order_dispatches (
    provider_id,
    scheduled_delivery_date,
    dispatch_type,
    status,
    provider_email,
    message_metadata,
    configured_send_at,
    lease_expires_at,
    worker_source
  )
  values (
    p_provider_id,
    p_scheduled_delivery_date,
    'automatic',
    'pending',
    v_provider.primary_order_email,
    jsonb_build_object('order_ids', to_jsonb(v_order_ids)),
    v_send_at,
    now() + interval '15 minutes',
    'automatic_worker'
  )
  returning id into v_dispatch_id;

  update public.provider_late_order_automatic_opportunities
  set dispatch_id = v_dispatch_id,
      late_order_count = coalesce(array_length(v_order_ids, 1), 0)
  where id = v_opportunity_id;

  return jsonb_build_object(
    'action', 'send',
    'dispatch_id', v_dispatch_id,
    'provider_id', p_provider_id,
    'provider_email', v_provider.primary_order_email,
    'scheduled_delivery_date', p_scheduled_delivery_date,
    'order_date', v_order_date,
    'order_ids', to_jsonb(v_order_ids),
    'opportunity_id', v_opportunity_id
  );
end;
$$;

revoke all on function private.process_automatic_supplement_opportunity(uuid, date)
from public, anon, authenticated;

create or replace function public.worker_list_due_automatic_supplement_batches()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batches jsonb := '[]'::jsonb;
  v_provider record;
  v_order_date date;
  v_delivery_date date;
  v_offset integer;
begin
  perform private.assert_worker_service_caller();

  for v_provider in
    select id
    from public.lunch_providers
    where active = true
      and supplemental_dispatch_mode = 'automatic'
      and accepts_late_orders = true
  loop
    foreach v_offset in array array[0, 1, 2, 3, 4, 5, 6]
    loop
      v_order_date := (private.jamaica_today_date() - v_offset)::date;

      if public.iso_weekday(v_order_date) is null then
        continue;
      end if;

      v_delivery_date := public.delivery_date_for_order_date(v_order_date);

      if v_delivery_date is null then
        continue;
      end if;

      if (select private.automatic_opportunity_exists(v_provider.id, v_delivery_date)) then
        continue;
      end if;

      if not (select private.automatic_supplement_is_due(
        v_provider.id,
        v_order_date,
        v_delivery_date,
        now()
      )) then
        continue;
      end if;

      if exists (
        select 1
        from public.provider_late_order_dispatches pld
        where pld.provider_id = v_provider.id
          and pld.scheduled_delivery_date = v_delivery_date
          and pld.status in ('pending', 'attention_required')
      ) then
        continue;
      end if;

      v_batches := v_batches || jsonb_build_array(
        jsonb_build_object(
          'provider_id', v_provider.id,
          'scheduled_delivery_date', v_delivery_date,
          'order_date', v_order_date
        )
      );
    end loop;
  end loop;

  return v_batches;
end;
$$;

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

  return private.process_automatic_supplement_opportunity(
    p_provider_id,
    p_scheduled_delivery_date
  );
end;
$$;

create or replace function public.worker_sweep_stale_pending_dispatches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_extra integer := 0;
  v_dispatch record;
begin
  perform private.assert_worker_service_caller();

  for v_dispatch in
    select id
    from public.provider_late_order_dispatches
    where status = 'pending'
      and lease_expires_at is not null
      and lease_expires_at < now()
    for update
  loop
    update public.provider_late_order_dispatches
    set status = 'attention_required',
        error_summary = left(
          'Dispatch remained pending beyond lease; manual review required before retry.',
          500
        )
    where id = v_dispatch.id;

    perform private.finalize_automatic_opportunity_for_dispatch(
      v_dispatch.id,
      'attention_required'
    );

    v_count := v_count + 1;
  end loop;

  update public.provider_late_order_automatic_opportunities
  set outcome = 'attention_required',
      processed_at = now()
  where outcome = 'processing'
    and created_at < now() - interval '15 minutes'
    and dispatch_id is null;

  get diagnostics v_extra = row_count;
  return v_count + v_extra;
end;
$$;

drop function if exists public.resolve_provider_late_order_dispatch_attention(uuid);

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

revoke execute on function public.acknowledge_provider_late_order_dispatch_not_received(uuid)
from public, anon;

grant execute on function public.acknowledge_provider_late_order_dispatch_not_received(uuid)
to authenticated;

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
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
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

revoke execute on function public.acknowledge_provider_late_order_dispatch_received(uuid)
from public, anon;

grant execute on function public.acknowledge_provider_late_order_dispatch_received(uuid)
to authenticated;

create or replace function private.maybe_materialize_current_weekday_snapshot(
  p_provider_id uuid,
  p_affected_weekday smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date := private.jamaica_today_date();
  v_order_weekday smallint;
begin
  v_order_weekday := public.iso_weekday(v_order_date);

  if v_order_weekday is null or p_affected_weekday is distinct from v_order_weekday then
    return;
  end if;

  if exists (
    select 1
    from public.lunch_days ld
    where ld.provider_id = p_provider_id
      and ld.order_date = v_order_date
  ) then
    return;
  end if;

  perform private.ensure_provider_lunch_day(p_provider_id, v_order_date);
end;
$$;

revoke all on function private.maybe_materialize_current_weekday_snapshot(uuid, smallint)
from public, anon, authenticated;

create or replace function private.freeze_snapshot_before_recurring_menu_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weekday smallint;
begin
  for v_weekday in
    select pmw.weekday
    from public.provider_menu_item_weekdays pmw
    where pmw.provider_menu_item_id = coalesce(new.id, old.id)
  loop
    perform private.maybe_materialize_current_weekday_snapshot(
      coalesce(new.provider_id, old.provider_id),
      v_weekday
    );
  end loop;

  return coalesce(new, old);
end;
$$;

create or replace function private.freeze_snapshot_before_recurring_menu_weekday_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
begin
  select pmi.provider_id
  into v_provider_id
  from public.provider_menu_items pmi
  where pmi.id = coalesce(new.provider_menu_item_id, old.provider_menu_item_id);

  if v_provider_id is not null then
    perform private.maybe_materialize_current_weekday_snapshot(
      v_provider_id,
      coalesce(new.weekday, old.weekday)
    );
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists freeze_snapshot_before_provider_menu_item_change
on public.provider_menu_items;

create trigger freeze_snapshot_before_provider_menu_item_change
before insert or update on public.provider_menu_items
for each row
execute function private.freeze_snapshot_before_recurring_menu_item_change();

drop trigger if exists freeze_snapshot_before_provider_menu_weekday_change
on public.provider_menu_item_weekdays;

create trigger freeze_snapshot_before_provider_menu_weekday_change
before insert or update or delete on public.provider_menu_item_weekdays
for each row
execute function private.freeze_snapshot_before_recurring_menu_weekday_change();
