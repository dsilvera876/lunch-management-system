-- Primary provider daily order email: dispatch tables, worker RPCs, failure alerts, catalog accuracy.

-- ------------------------------------------------------------
-- Dispatch storage
-- ------------------------------------------------------------

create table public.provider_primary_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.lunch_providers (id) on delete restrict,
  scheduled_delivery_date date not null,
  dispatch_type text not null check (dispatch_type in ('automatic', 'manual')),
  status text not null check (status in ('pending', 'sent', 'failed', 'attention_required')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  provider_email text,
  error_summary text,
  message_metadata jsonb not null default '{}'::jsonb,
  transport_metadata jsonb,
  lease_expires_at timestamptz,
  worker_source text
    check (worker_source is null or worker_source in ('manual_hr', 'automatic_worker')),
  resend_of_dispatch_id uuid references public.provider_primary_order_dispatches (id) on delete set null
);

create index provider_primary_order_dispatches_lookup_idx
  on public.provider_primary_order_dispatches (provider_id, scheduled_delivery_date, created_at desc);

create table public.provider_primary_order_dispatch_orders (
  dispatch_id uuid not null
    references public.provider_primary_order_dispatches (id) on delete cascade,
  order_id uuid not null
    references public.orders (id) on delete restrict,
  primary key (dispatch_id, order_id)
);

create unique index provider_primary_order_dispatch_orders_order_once_idx
  on public.provider_primary_order_dispatch_orders (order_id);

create table public.provider_primary_order_automatic_opportunities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.lunch_providers (id) on delete restrict,
  scheduled_delivery_date date not null,
  order_date date not null,
  order_cutoff_at timestamptz not null,
  processed_at timestamptz not null default now(),
  outcome text not null check (
    outcome in ('processing', 'sent', 'no_orders', 'failed', 'attention_required', 'email_missing')
  ),
  dispatch_id uuid references public.provider_primary_order_dispatches (id) on delete set null,
  order_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (provider_id, scheduled_delivery_date)
);

create table public.provider_primary_order_dispatch_reviews (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.provider_primary_order_dispatches (id) on delete cascade,
  resolution text not null check (
    resolution in ('confirmed_not_received', 'confirmed_received')
  ),
  resolved_by uuid not null references public.profiles (id),
  resolved_at timestamptz not null default now(),
  notes text
);

alter table public.provider_primary_order_dispatches enable row level security;
alter table public.provider_primary_order_dispatch_orders enable row level security;
alter table public.provider_primary_order_automatic_opportunities enable row level security;
alter table public.provider_primary_order_dispatch_reviews enable row level security;

create policy "HR can view primary order dispatches"
on public.provider_primary_order_dispatches
for select
to authenticated
using ((select private.can_view_all_orders()));

create policy "HR can view primary order dispatch membership"
on public.provider_primary_order_dispatch_orders
for select
to authenticated
using ((select private.can_view_all_orders()));

create policy "HR can view primary automatic opportunities"
on public.provider_primary_order_automatic_opportunities
for select
to authenticated
using ((select private.can_view_all_orders()));

create policy "HR can view primary dispatch reviews"
on public.provider_primary_order_dispatch_reviews
for select
to authenticated
using ((select private.can_view_all_orders()));

revoke insert, update, delete on public.provider_primary_order_dispatches from authenticated;
revoke insert, update, delete on public.provider_primary_order_dispatch_orders from authenticated;
revoke insert, update, delete on public.provider_primary_order_automatic_opportunities from authenticated;
revoke insert, update, delete on public.provider_primary_order_dispatch_reviews from authenticated;

alter table private.notification_delivery_log
  add column if not exists failed_provider_primary_dispatch_id uuid
    references public.provider_primary_order_dispatches (id) on delete set null;

create index if not exists notification_delivery_log_failed_primary_dispatch_id_idx
  on private.notification_delivery_log (failed_provider_primary_dispatch_id)
  where failed_provider_primary_dispatch_id is not null;

-- ------------------------------------------------------------
-- Eligibility helpers
-- ------------------------------------------------------------

create or replace function private.eligible_primary_normal_order_ids(
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
  where ld.provider_id = p_provider_id
    and ld.lunch_date = p_scheduled_delivery_date
    and o.is_late_order = false
    and o.status = 'submitted'
    and o.financial_disposition <> 'waived';
$$;

revoke all on function private.eligible_primary_normal_order_ids(uuid, date)
from public, anon, authenticated;

create or replace function private.primary_automatic_opportunity_exists(
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
    from public.provider_primary_order_automatic_opportunities o
    where o.provider_id = p_provider_id
      and o.scheduled_delivery_date = p_scheduled_delivery_date
  );
$$;

revoke all on function private.primary_automatic_opportunity_exists(uuid, date)
from public, anon, authenticated;

create or replace function private.primary_order_ids_from_dispatch(p_dispatch_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(d.message_metadata -> 'order_ids')::uuid
    ),
    '{}'::uuid[]
  )
  from public.provider_primary_order_dispatches d
  where d.id = p_dispatch_id;
$$;

revoke all on function private.primary_order_ids_from_dispatch(uuid)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Claim / finalize core
-- ------------------------------------------------------------

create or replace function private.claim_provider_primary_order_core(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_dispatch_type text,
  p_created_by uuid,
  p_worker_source text,
  p_resend_of_dispatch_id uuid default null,
  p_order_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider record;
  v_dispatch_id uuid;
  v_order_ids uuid[];
  v_blocking_status text;
  v_resend record;
  v_metadata jsonb;
  v_order_date date;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'primary-order:' || p_provider_id::text || ':' || p_scheduled_delivery_date::text,
      0
    )
  );

  select d.status
  into v_blocking_status
  from public.provider_primary_order_dispatches d
  where d.provider_id = p_provider_id
    and d.scheduled_delivery_date = p_scheduled_delivery_date
    and d.status in ('pending', 'attention_required')
  order by d.created_at desc
  limit 1;

  if v_blocking_status = 'pending' then
    raise exception 'Primary order dispatch already in progress';
  end if;

  if v_blocking_status = 'attention_required' then
    raise exception 'Primary dispatch requires HR review before retry';
  end if;

  if p_resend_of_dispatch_id is null
     and exists (
       select 1
       from public.provider_primary_order_dispatches d
       where d.provider_id = p_provider_id
         and d.scheduled_delivery_date = p_scheduled_delivery_date
         and d.status = 'sent'
     ) then
    raise exception 'Primary provider order already sent for this delivery date';
  end if;

  select lp.primary_order_email, lp.name, lp.active
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id;

  if not found or not v_provider.active then
    raise exception 'Provider is not available';
  end if;

  if p_resend_of_dispatch_id is null then
    v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date);

    if v_order_date is null then
      raise exception 'No order date for delivery date';
    end if;

    if clock_timestamp() <= public.order_deadline_for_order_date(v_order_date) then
      raise exception 'Primary provider order cannot be sent before the normal staff ordering cutoff';
    end if;
  end if;

  if p_resend_of_dispatch_id is not null then
    select *
    into v_resend
    from public.provider_primary_order_dispatches d
    where d.id = p_resend_of_dispatch_id
      and d.provider_id = p_provider_id
      and d.scheduled_delivery_date = p_scheduled_delivery_date;

    if not found then
      raise exception 'Original primary dispatch not found for resend';
    end if;

    v_order_ids := private.primary_order_ids_from_dispatch(p_resend_of_dispatch_id);

    if coalesce(array_length(v_order_ids, 1), 0) = 0 then
      raise exception 'Original primary dispatch has no order snapshot';
    end if;
  elsif p_order_ids is not null then
    v_order_ids := p_order_ids;
  else
    v_order_ids := private.eligible_primary_normal_order_ids(
      p_provider_id,
      p_scheduled_delivery_date
    );
  end if;

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    raise exception 'No qualifying normal orders for this provider and delivery date';
  end if;

  v_metadata := jsonb_build_object('order_ids', to_jsonb(v_order_ids));

  if p_resend_of_dispatch_id is not null then
    if v_resend.message_metadata ? 'email_snapshot' then
      v_metadata := v_metadata || jsonb_build_object(
        'email_snapshot',
        v_resend.message_metadata -> 'email_snapshot'
      );
    end if;
  end if;

  insert into public.provider_primary_order_dispatches (
    provider_id,
    scheduled_delivery_date,
    dispatch_type,
    status,
    created_by,
    provider_email,
    message_metadata,
    lease_expires_at,
    worker_source,
    resend_of_dispatch_id
  )
  values (
    p_provider_id,
    p_scheduled_delivery_date,
    p_dispatch_type,
    'pending',
    p_created_by,
    v_provider.primary_order_email,
    v_metadata,
    now() + interval '15 minutes',
    p_worker_source,
    p_resend_of_dispatch_id
  )
  returning id into v_dispatch_id;

  return jsonb_build_object(
    'dispatch_id', v_dispatch_id,
    'provider_id', p_provider_id,
    'provider_email', v_provider.primary_order_email,
    'provider_name', v_provider.name,
    'scheduled_delivery_date', p_scheduled_delivery_date,
    'order_ids', to_jsonb(v_order_ids),
    'email_snapshot', v_metadata -> 'email_snapshot'
  );
end;
$$;

revoke all on function private.claim_provider_primary_order_core(uuid, date, text, uuid, text, uuid, uuid[])
from public, anon, authenticated;

create or replace function private.persist_provider_primary_order_email_snapshot_core(
  p_dispatch_id uuid,
  p_email_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_email_snapshot is null or p_email_snapshot = 'null'::jsonb then
    raise exception 'Email snapshot is required';
  end if;

  update public.provider_primary_order_dispatches
  set message_metadata = message_metadata || jsonb_build_object(
    'email_snapshot',
    p_email_snapshot
  )
  where id = p_dispatch_id
    and status = 'pending'
    and not (message_metadata ? 'email_snapshot');

  if not found
     and not exists (
       select 1
       from public.provider_primary_order_dispatches d
       where d.id = p_dispatch_id
         and d.status = 'pending'
         and d.message_metadata ? 'email_snapshot'
     ) then
    raise exception 'Primary dispatch is not pending or not found';
  end if;
end;
$$;

revoke all on function private.persist_provider_primary_order_email_snapshot_core(uuid, jsonb)
from public, anon, authenticated;

create or replace function private.finalize_primary_automatic_opportunity_for_dispatch(
  p_dispatch_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch record;
  v_count integer;
begin
  select *
  into v_dispatch
  from public.provider_primary_order_dispatches
  where id = p_dispatch_id;

  if not found or v_dispatch.dispatch_type <> 'automatic' then
    return;
  end if;

  v_count := coalesce(
    jsonb_array_length(v_dispatch.message_metadata -> 'order_ids'),
    0
  );

  update public.provider_primary_order_automatic_opportunities
  set outcome = p_outcome,
      processed_at = now(),
      dispatch_id = p_dispatch_id,
      order_count = v_count
  where provider_id = v_dispatch.provider_id
    and scheduled_delivery_date = v_dispatch.scheduled_delivery_date
    and outcome in ('processing', 'attention_required');
end;
$$;

revoke all on function private.finalize_primary_automatic_opportunity_for_dispatch(uuid, text)
from public, anon, authenticated;

create or replace function private.notify_admin_provider_primary_email_dispatch_failure(
  p_dispatch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operational_date date;
  v_batch_id uuid;
  v_admin record;
  v_idempotency_key text;
begin
  if p_dispatch_id is null then
    return;
  end if;

  if not private.notification_globally_enabled('admin.email_delivery_failure') then
    return;
  end if;

  if not exists (
    select 1
    from public.provider_primary_order_dispatches d
    where d.id = p_dispatch_id
      and d.status = 'failed'
  ) then
    return;
  end if;

  v_operational_date := (now() at time zone 'America/Jamaica')::date;

  for v_admin in
    select p.id as profile_id
    from public.profiles p
    where p.role in ('admin', 'owner')
      and p.account_status = 'active'
  loop
    if not private.admin_technical_notification_recipient_eligible(
      v_admin.profile_id,
      'admin.email_delivery_failure'
    ) then
      continue;
    end if;

    if v_batch_id is null then
      insert into private.notification_delivery_batch (event_key, operational_date)
      values ('admin.email_delivery_failure', v_operational_date)
      returning id into v_batch_id;
    end if;

    v_idempotency_key :=
      'admin.email_delivery_failure:primary_dispatch:'
      || p_dispatch_id::text
      || ':'
      || v_admin.profile_id::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key,
      failed_provider_primary_dispatch_id
    )
    values (
      'admin.email_delivery_failure',
      v_admin.profile_id,
      v_operational_date,
      v_batch_id,
      'pending',
      v_idempotency_key,
      p_dispatch_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception
  when others then
    raise warning 'notify_admin_provider_primary_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.notify_admin_provider_primary_email_dispatch_failure(uuid) from public;

create or replace function private.notify_hr_provider_primary_email_dispatch_failure(
  p_dispatch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operational_date date;
  v_batch_id uuid;
  v_hr record;
  v_idempotency_key text;
begin
  if p_dispatch_id is null then
    return;
  end if;

  if not private.notification_globally_enabled('hr.email_delivery_failure') then
    return;
  end if;

  if not exists (
    select 1
    from public.provider_primary_order_dispatches d
    where d.id = p_dispatch_id
      and d.status = 'failed'
  ) then
    return;
  end if;

  v_operational_date := (now() at time zone 'America/Jamaica')::date;

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.hr_operational_notification_recipient_eligible(
      v_hr.profile_id,
      'hr.email_delivery_failure'
    ) then
      continue;
    end if;

    if v_batch_id is null then
      insert into private.notification_delivery_batch (event_key, operational_date)
      values ('hr.email_delivery_failure', v_operational_date)
      returning id into v_batch_id;
    end if;

    v_idempotency_key :=
      'hr.email_delivery_failure:primary_dispatch:'
      || p_dispatch_id::text
      || ':'
      || v_hr.profile_id::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key,
      failed_provider_primary_dispatch_id,
      provider_failure_kind
    )
    values (
      'hr.email_delivery_failure',
      v_hr.profile_id,
      v_operational_date,
      v_batch_id,
      'pending',
      v_idempotency_key,
      p_dispatch_id,
      'primary_lunch_order'
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception
  when others then
    raise warning 'notify_hr_provider_primary_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.notify_hr_provider_primary_email_dispatch_failure(uuid) from public;

create or replace function private.safe_notify_provider_primary_email_dispatch_failure(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_admin_provider_primary_email_dispatch_failure(p_dispatch_id);
  perform private.notify_hr_provider_primary_email_dispatch_failure(p_dispatch_id);
exception
  when others then
    raise warning 'safe_notify_provider_primary_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_provider_primary_email_dispatch_failure(uuid) from public;

create or replace function private.finalize_provider_primary_order_core(
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
  from public.provider_primary_order_dispatches
  where id = p_dispatch_id
  for update;

  if not found then
    raise exception 'Primary dispatch not found';
  end if;

  if v_dispatch.status <> 'pending' then
    raise exception 'Primary dispatch is not pending';
  end if;

  v_order_ids := coalesce(v_dispatch.message_metadata -> 'order_ids', '[]'::jsonb);

  if p_attention_required then
    update public.provider_primary_order_dispatches
    set status = 'attention_required',
        error_summary = left(
          coalesce(p_error_summary, 'Email delivery outcome uncertain; manual review required'),
          500
        ),
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;

    perform private.finalize_primary_automatic_opportunity_for_dispatch(
      p_dispatch_id,
      'attention_required'
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
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where o.id = v_order_id
          and ld.provider_id = v_dispatch.provider_id
          and ld.lunch_date = v_dispatch.scheduled_delivery_date
          and o.is_late_order = false
      ) then
        raise exception 'Order % is not eligible for primary provider dispatch', v_order_id;
      end if;

      insert into public.provider_primary_order_dispatch_orders (
        dispatch_id,
        order_id
      )
      values (
        p_dispatch_id,
        v_order_id
      )
      on conflict (order_id) do nothing;
    end loop;

    update public.provider_primary_order_dispatches
    set status = 'sent',
        sent_at = now(),
        error_summary = null,
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;

    perform private.finalize_primary_automatic_opportunity_for_dispatch(
      p_dispatch_id,
      'sent'
    );
  else
    update public.provider_primary_order_dispatches
    set status = 'failed',
        error_summary = left(coalesce(p_error_summary, 'Email send failed'), 500),
        transport_metadata = p_transport_metadata
    where id = p_dispatch_id;

    perform private.finalize_primary_automatic_opportunity_for_dispatch(
      p_dispatch_id,
      'failed'
    );

    perform private.safe_notify_provider_primary_email_dispatch_failure(p_dispatch_id);
  end if;
end;
$$;

revoke all on function private.finalize_provider_primary_order_core(uuid, boolean, text, jsonb, boolean)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Automatic opportunity processing
-- ------------------------------------------------------------

create or replace function private.process_automatic_primary_opportunity(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_order_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider record;
  v_dispatch_id uuid;
  v_order_ids uuid[];
  v_cutoff timestamptz;
  v_opportunity_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'primary-order:' || p_provider_id::text || ':' || p_scheduled_delivery_date::text,
      0
    )
  );

  if not private.notification_globally_enabled('provider.daily_order_summary') then
    raise exception 'Primary provider email is globally disabled';
  end if;

  if (select private.primary_automatic_opportunity_exists(p_provider_id, p_scheduled_delivery_date)) then
    raise exception 'Primary automatic opportunity already processed';
  end if;

  if exists (
    select 1
    from public.provider_primary_order_dispatches d
    where d.provider_id = p_provider_id
      and d.scheduled_delivery_date = p_scheduled_delivery_date
      and d.status = 'sent'
  ) then
    select d.id
    into v_dispatch_id
    from public.provider_primary_order_dispatches d
    where d.provider_id = p_provider_id
      and d.scheduled_delivery_date = p_scheduled_delivery_date
      and d.status = 'sent'
    order by d.sent_at desc nulls last, d.created_at desc
    limit 1;

    v_order_ids := private.primary_order_ids_from_dispatch(v_dispatch_id);
    v_cutoff := public.order_deadline_for_order_date(p_order_date);

    insert into public.provider_primary_order_automatic_opportunities (
      provider_id,
      scheduled_delivery_date,
      order_date,
      order_cutoff_at,
      outcome,
      dispatch_id,
      order_count
    )
    values (
      p_provider_id,
      p_scheduled_delivery_date,
      p_order_date,
      v_cutoff,
      'sent',
      v_dispatch_id,
      coalesce(array_length(v_order_ids, 1), 0)
    );

    return jsonb_build_object(
      'action', 'already_sent',
      'provider_id', p_provider_id,
      'scheduled_delivery_date', p_scheduled_delivery_date,
      'dispatch_id', v_dispatch_id
    );
  end if;

  v_cutoff := public.order_deadline_for_order_date(p_order_date);

  if now() <= v_cutoff then
    raise exception 'Normal ordering cutoff has not passed';
  end if;

  select lp.primary_order_email, lp.active
  into v_provider
  from public.lunch_providers lp
  where lp.id = p_provider_id;

  if not found or not v_provider.active then
    raise exception 'Provider is not available';
  end if;

  insert into public.provider_primary_order_automatic_opportunities (
    provider_id,
    scheduled_delivery_date,
    order_date,
    order_cutoff_at,
    outcome,
    order_count
  )
  values (
    p_provider_id,
    p_scheduled_delivery_date,
    p_order_date,
    v_cutoff,
    'processing',
    0
  )
  returning id into v_opportunity_id;

  v_order_ids := private.eligible_primary_normal_order_ids(
    p_provider_id,
    p_scheduled_delivery_date
  );

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    update public.provider_primary_order_automatic_opportunities
    set outcome = 'no_orders',
        processed_at = now(),
        order_count = 0
    where id = v_opportunity_id;

    return jsonb_build_object(
      'action', 'no_orders',
      'provider_id', p_provider_id,
      'scheduled_delivery_date', p_scheduled_delivery_date,
      'opportunity_id', v_opportunity_id
    );
  end if;

  if v_provider.primary_order_email is null
     or length(trim(v_provider.primary_order_email)) = 0 then
    update public.provider_primary_order_automatic_opportunities
    set outcome = 'email_missing',
        processed_at = now(),
        order_count = coalesce(array_length(v_order_ids, 1), 0)
    where id = v_opportunity_id;

    return jsonb_build_object(
      'action', 'email_missing',
      'provider_id', p_provider_id,
      'scheduled_delivery_date', p_scheduled_delivery_date,
      'opportunity_id', v_opportunity_id,
      'order_count', coalesce(array_length(v_order_ids, 1), 0)
    );
  end if;

  if exists (
    select 1
    from public.provider_primary_order_dispatches d
    where d.provider_id = p_provider_id
      and d.scheduled_delivery_date = p_scheduled_delivery_date
      and d.status in ('pending', 'attention_required')
  ) then
    raise exception 'Primary dispatch already in progress';
  end if;

  insert into public.provider_primary_order_dispatches (
    provider_id,
    scheduled_delivery_date,
    dispatch_type,
    status,
    provider_email,
    message_metadata,
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
    now() + interval '15 minutes',
    'automatic_worker'
  )
  returning id into v_dispatch_id;

  update public.provider_primary_order_automatic_opportunities
  set dispatch_id = v_dispatch_id,
      order_count = coalesce(array_length(v_order_ids, 1), 0)
  where id = v_opportunity_id;

  return jsonb_build_object(
    'action', 'send',
    'dispatch_id', v_dispatch_id,
    'provider_id', p_provider_id,
    'provider_email', v_provider.primary_order_email,
    'scheduled_delivery_date', p_scheduled_delivery_date,
    'order_ids', to_jsonb(v_order_ids),
    'opportunity_id', v_opportunity_id
  );
end;
$$;

revoke all on function private.process_automatic_primary_opportunity(uuid, date, date)
from public, anon, authenticated;

create or replace function public.worker_list_due_automatic_primary_batches()
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
  v_cutoff timestamptz;
  v_offset integer;
begin
  perform private.assert_worker_service_caller();

  if not private.notification_globally_enabled('provider.daily_order_summary') then
    return '[]'::jsonb;
  end if;

  for v_provider in
    select id
    from public.lunch_providers
    where active = true
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

      if (select private.primary_automatic_opportunity_exists(v_provider.id, v_delivery_date)) then
        continue;
      end if;

      v_cutoff := public.order_deadline_for_order_date(v_order_date);

      if now() <= v_cutoff then
        continue;
      end if;

      if exists (
        select 1
        from public.provider_primary_order_dispatches d
        where d.provider_id = v_provider.id
          and d.scheduled_delivery_date = v_delivery_date
          and d.status in ('pending', 'attention_required')
      ) then
        continue;
      end if;

      if exists (
        select 1
        from public.provider_primary_order_dispatches d
        where d.provider_id = v_provider.id
          and d.scheduled_delivery_date = v_delivery_date
          and d.status = 'sent'
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

revoke execute on function public.worker_list_due_automatic_primary_batches()
from public, anon, authenticated;
grant execute on function public.worker_list_due_automatic_primary_batches() to service_role;

create or replace function public.worker_claim_automatic_provider_primary_order(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_order_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_worker_service_caller();

  return private.process_automatic_primary_opportunity(
    p_provider_id,
    p_scheduled_delivery_date,
    p_order_date
  );
end;
$$;

revoke execute on function public.worker_claim_automatic_provider_primary_order(uuid, date, date)
from public, anon, authenticated;
grant execute on function public.worker_claim_automatic_provider_primary_order(uuid, date, date) to service_role;

create or replace function public.worker_finalize_provider_primary_order(
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

  perform private.finalize_provider_primary_order_core(
    p_dispatch_id,
    p_success,
    p_error_summary,
    p_transport_metadata,
    p_attention_required
  );
end;
$$;

revoke execute on function public.worker_finalize_provider_primary_order(uuid, boolean, text, jsonb, boolean)
from public, anon, authenticated;
grant execute on function public.worker_finalize_provider_primary_order(uuid, boolean, text, jsonb, boolean) to service_role;

create or replace function public.worker_sweep_stale_pending_primary_dispatches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_dispatch record;
begin
  perform private.assert_worker_service_caller();

  for v_dispatch in
    select id
    from public.provider_primary_order_dispatches
    where status = 'pending'
      and lease_expires_at is not null
      and lease_expires_at < now()
    for update
  loop
    update public.provider_primary_order_dispatches
    set status = 'attention_required',
        error_summary = left(
          'Dispatch remained pending beyond lease; manual review required before retry.',
          500
        )
    where id = v_dispatch.id;

    perform private.finalize_primary_automatic_opportunity_for_dispatch(
      v_dispatch.id,
      'attention_required'
    );

    v_count := v_count + 1;
  end loop;

  update public.provider_primary_order_automatic_opportunities
  set outcome = 'attention_required',
      processed_at = now()
  where outcome = 'processing'
    and created_at < now() - interval '15 minutes'
    and dispatch_id is null;

  return v_count;
end;
$$;

revoke execute on function public.worker_sweep_stale_pending_primary_dispatches()
from public, anon, authenticated;
grant execute on function public.worker_sweep_stale_pending_primary_dispatches() to service_role;

-- ------------------------------------------------------------
-- Immutable provider email snapshot (set once before first send)
-- ------------------------------------------------------------

create or replace function public.persist_provider_primary_order_email_snapshot(
  p_dispatch_id uuid,
  p_email_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  perform private.persist_provider_primary_order_email_snapshot_core(
    p_dispatch_id,
    p_email_snapshot
  );
end;
$$;

revoke execute on function public.persist_provider_primary_order_email_snapshot(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.persist_provider_primary_order_email_snapshot(uuid, jsonb) to authenticated;

create or replace function public.worker_persist_provider_primary_order_email_snapshot(
  p_dispatch_id uuid,
  p_email_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_worker_service_caller();

  perform private.persist_provider_primary_order_email_snapshot_core(
    p_dispatch_id,
    p_email_snapshot
  );
end;
$$;

revoke execute on function public.worker_persist_provider_primary_order_email_snapshot(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.worker_persist_provider_primary_order_email_snapshot(uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- HR manual send / resend / attention
-- ------------------------------------------------------------

create or replace function public.claim_provider_primary_order_manual(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_resend_of_dispatch_id uuid default null
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

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  return private.claim_provider_primary_order_core(
    p_provider_id,
    p_scheduled_delivery_date,
    'manual',
    v_actor,
    'manual_hr',
    p_resend_of_dispatch_id,
    null
  );
end;
$$;

revoke execute on function public.claim_provider_primary_order_manual(uuid, date, uuid)
from public, anon, authenticated;
grant execute on function public.claim_provider_primary_order_manual(uuid, date, uuid) to authenticated;

create or replace function public.finalize_provider_primary_order(
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

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  perform private.finalize_provider_primary_order_core(
    p_dispatch_id,
    p_success,
    p_error_summary,
    p_transport_metadata,
    p_attention_required
  );
end;
$$;

revoke execute on function public.finalize_provider_primary_order(uuid, boolean, text, jsonb, boolean)
from public, anon, authenticated;
grant execute on function public.finalize_provider_primary_order(uuid, boolean, text, jsonb, boolean) to authenticated;

create or replace function public.acknowledge_provider_primary_order_dispatch_not_received(
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

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  update public.provider_primary_order_dispatches
  set status = 'failed',
      error_summary = left(
        'HR confirmed provider did not receive email; retry allowed after provider confirmation.',
        500
      )
  where id = p_dispatch_id
    and status = 'attention_required';

  if not found then
    raise exception 'Primary dispatch is not awaiting review';
  end if;

  insert into public.provider_primary_order_dispatch_reviews (
    dispatch_id,
    resolution,
    resolved_by
  )
  values (
    p_dispatch_id,
    'confirmed_not_received',
    v_actor
  );
end;
$$;

grant execute on function public.acknowledge_provider_primary_order_dispatch_not_received(uuid) to authenticated;

create or replace function public.acknowledge_provider_primary_order_dispatch_received(
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
begin
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  select *
  into v_dispatch
  from public.provider_primary_order_dispatches
  where id = p_dispatch_id
    and status = 'attention_required'
  for update;

  if not found then
    raise exception 'Primary dispatch is not awaiting review';
  end if;

  v_order_ids := coalesce(v_dispatch.message_metadata -> 'order_ids', '[]'::jsonb);

  for v_order_id in
    select value::uuid
    from jsonb_array_elements_text(v_order_ids)
  loop
    insert into public.provider_primary_order_dispatch_orders (
      dispatch_id,
      order_id
    )
    values (
      p_dispatch_id,
      v_order_id
    )
    on conflict (order_id) do nothing;
  end loop;

  update public.provider_primary_order_dispatches
  set status = 'sent',
      sent_at = coalesce(sent_at, now()),
      error_summary = null
  where id = p_dispatch_id;

  insert into public.provider_primary_order_dispatch_reviews (
    dispatch_id,
    resolution,
    resolved_by
  )
  values (
    p_dispatch_id,
    'confirmed_received',
    v_actor
  );
end;
$$;

grant execute on function public.acknowledge_provider_primary_order_dispatch_received(uuid) to authenticated;

create or replace function public.list_provider_primary_dispatch_status_for_order_date(
  p_order_date date
)
returns table (
  provider_id uuid,
  scheduled_delivery_date date,
  latest_status text,
  latest_dispatch_id uuid,
  resend_source_dispatch_id uuid,
  sent_at timestamptz,
  error_summary text,
  automatic_outcome text,
  primary_order_email text,
  qualifying_order_count integer,
  globally_enabled boolean,
  cutoff_passed boolean,
  has_successful_primary_send boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery_date date;
  v_cutoff timestamptz;
begin
  if not (select private.can_view_all_orders()) then
    raise exception 'HR operational access required';
  end if;

  v_delivery_date := public.delivery_date_for_order_date(p_order_date);
  v_cutoff := public.order_deadline_for_order_date(p_order_date);

  return query
  select
    lp.id,
    v_delivery_date,
    coalesce(latest.status, 'none'),
    latest.id,
    latest.resend_of_dispatch_id,
    latest.sent_at,
    latest.error_summary,
    opp.outcome,
    lp.primary_order_email,
    coalesce(
      (
        select count(*)::integer
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        where ld.provider_id = lp.id
          and ld.lunch_date = v_delivery_date
          and o.is_late_order = false
          and o.status = 'submitted'
          and o.financial_disposition <> 'waived'
      ),
      0
    ),
    private.notification_globally_enabled('provider.daily_order_summary'),
    now() > v_cutoff,
    exists (
      select 1
      from public.provider_primary_order_dispatches sent
      where sent.provider_id = lp.id
        and sent.scheduled_delivery_date = v_delivery_date
        and sent.status = 'sent'
    )
  from public.lunch_providers lp
  left join lateral (
    select d.*
    from public.provider_primary_order_dispatches d
    where d.provider_id = lp.id
      and d.scheduled_delivery_date = v_delivery_date
    order by d.created_at desc
    limit 1
  ) latest on true
  left join public.provider_primary_order_automatic_opportunities opp
    on opp.provider_id = lp.id
   and opp.scheduled_delivery_date = v_delivery_date
  where lp.active = true
    and v_delivery_date is not null
  order by lp.name asc;
end;
$$;

grant execute on function public.list_provider_primary_dispatch_status_for_order_date(date) to authenticated;

-- Extend worker context + pending lists for primary dispatch failures

drop function if exists public.worker_get_admin_email_delivery_failure_context(uuid);

create or replace function public.worker_get_admin_email_delivery_failure_context(
  p_delivery_id uuid
)
returns table (
  failure_source text,
  message_type text,
  recipient text,
  failed_at timestamptz,
  error_summary text,
  provider_name text,
  scheduled_delivery_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery private.notification_delivery_log%rowtype;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_delivery
  from private.notification_delivery_log d
  where d.id = p_delivery_id
    and d.event_key = 'admin.email_delivery_failure';

  if not found then
    return;
  end if;

  if v_delivery.failed_email_queue_id is not null then
    return query
    select
      'email_delivery_queue'::text,
      q.message_type,
      q.recipient_email,
      coalesce(q.claimed_at, q.created_at),
      left(coalesce(nullif(btrim(q.last_error), ''), 'Delivery failed'), 500),
      null::text,
      null::date
    from private.email_delivery_queue q
    where q.id = v_delivery.failed_email_queue_id;
    return;
  end if;

  if v_delivery.failed_provider_dispatch_id is not null then
    return query
    select
      'provider_supplemental_dispatch'::text,
      'Provider supplemental late-order dispatch'::text,
      coalesce(d.provider_email, 'unknown'),
      coalesce(d.sent_at, d.created_at),
      left(coalesce(nullif(btrim(d.error_summary), ''), 'Delivery failed'), 500),
      lp.name,
      d.scheduled_delivery_date
    from public.provider_late_order_dispatches d
    inner join public.lunch_providers lp on lp.id = d.provider_id
    where d.id = v_delivery.failed_provider_dispatch_id;
    return;
  end if;

  if v_delivery.failed_provider_primary_dispatch_id is not null then
    return query
    select
      'provider_primary_dispatch'::text,
      'Provider primary lunch-order dispatch'::text,
      coalesce(d.provider_email, 'unknown'),
      coalesce(d.sent_at, d.created_at),
      left(coalesce(nullif(btrim(d.error_summary), ''), 'Delivery failed'), 500),
      lp.name,
      d.scheduled_delivery_date
    from public.provider_primary_order_dispatches d
    inner join public.lunch_providers lp on lp.id = d.provider_id
    where d.id = v_delivery.failed_provider_primary_dispatch_id;
  end if;
end;
$$;

grant execute on function public.worker_get_admin_email_delivery_failure_context(uuid) to service_role;

drop function if exists public.worker_get_hr_email_delivery_failure_context(uuid);

create or replace function public.worker_get_hr_email_delivery_failure_context(
  p_delivery_id uuid
)
returns table (
  email_type text,
  recipient text,
  failed_at timestamptz,
  provider_follow_up boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery private.notification_delivery_log%rowtype;
  v_category text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_delivery
  from private.notification_delivery_log d
  where d.id = p_delivery_id
    and d.event_key = 'hr.email_delivery_failure';

  if not found then
    return;
  end if;

  if v_delivery.failed_email_queue_id is not null then
    v_category := private.email_queue_hr_failure_business_category(v_delivery.failed_email_queue_id);

    return query
    select
      private.hr_email_failure_display_label(v_category),
      q.recipient_email,
      coalesce(q.claimed_at, q.created_at),
      v_category in ('primary_lunch_order', 'supplemental_late_order')
    from private.email_delivery_queue q
    where q.id = v_delivery.failed_email_queue_id;
    return;
  end if;

  if v_delivery.failed_provider_dispatch_id is not null then
    return query
    select
      private.hr_email_failure_display_label('supplemental_late_order'),
      coalesce(d.provider_email, 'unknown'),
      coalesce(d.sent_at, d.created_at),
      true
    from public.provider_late_order_dispatches d
    where d.id = v_delivery.failed_provider_dispatch_id;
    return;
  end if;

  if v_delivery.failed_provider_primary_dispatch_id is not null then
    return query
    select
      private.hr_email_failure_display_label('primary_lunch_order'),
      coalesce(d.provider_email, 'unknown'),
      coalesce(d.sent_at, d.created_at),
      true
    from public.provider_primary_order_dispatches d
    where d.id = v_delivery.failed_provider_primary_dispatch_id;
  end if;
end;
$$;

grant execute on function public.worker_get_hr_email_delivery_failure_context(uuid) to service_role;

drop function if exists public.worker_list_pending_admin_email_delivery_failure_notifications(integer);

create or replace function public.worker_list_pending_admin_email_delivery_failure_notifications(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  failed_email_queue_id uuid,
  failed_provider_dispatch_id uuid,
  failed_provider_primary_dispatch_id uuid,
  operational_date date,
  recipient_email text,
  recipient_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  return query
  select
    d.id,
    d.event_key,
    d.failed_email_queue_id,
    d.failed_provider_dispatch_id,
    d.failed_provider_primary_dispatch_id,
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'admin.email_delivery_failure'
    and d.status = 'pending'
    and d.email_queue_id is null
    and (
      d.failed_email_queue_id is not null
      or d.failed_provider_dispatch_id is not null
      or d.failed_provider_primary_dispatch_id is not null
    )
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

grant execute on function public.worker_list_pending_admin_email_delivery_failure_notifications(integer) to service_role;

drop function if exists public.worker_list_pending_hr_email_delivery_failure_notifications(integer);

create or replace function public.worker_list_pending_hr_email_delivery_failure_notifications(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  failed_email_queue_id uuid,
  failed_provider_dispatch_id uuid,
  failed_provider_primary_dispatch_id uuid,
  operational_date date,
  recipient_email text,
  recipient_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  return query
  select
    d.id,
    d.event_key,
    d.failed_email_queue_id,
    d.failed_provider_dispatch_id,
    d.failed_provider_primary_dispatch_id,
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'hr.email_delivery_failure'
    and d.status = 'pending'
    and d.email_queue_id is null
    and (
      d.failed_email_queue_id is not null
      or d.failed_provider_dispatch_id is not null
      or d.failed_provider_primary_dispatch_id is not null
    )
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

grant execute on function public.worker_list_pending_hr_email_delivery_failure_notifications(integer) to service_role;

-- Catalog accuracy for provider.daily_order_summary
update private.notification_event_catalog
set
  description = 'Automatically email each provider their normal daily lunch order after the staff ordering cutoff. Late orders are sent separately as supplements.',
  timing_configurable = false,
  timing_mode = 'immediate'
where event_key = 'provider.daily_order_summary';

update private.notification_settings
set send_time = null
where event_key = 'provider.daily_order_summary';
