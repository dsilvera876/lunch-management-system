-- Operational Notification Bell Phase 3: delivery-failure attention (HR + Admin/Owner).
-- In-app items use per-failure-entity idempotency (same granularity as email failure alerts).

create or replace function private.oa_delivery_failure_recovered(p_new_status text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(btrim(p_new_status), '') = 'sent';
$$;

revoke all on function private.oa_delivery_failure_recovered(text) from public;

create or replace function private.operational_attention_admin_queue_failure_body(
  p_message_type text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    'Terminal email delivery failed for message type '
    || coalesce(nullif(btrim(p_message_type), ''), 'unknown')
    || '. Review Email Delivery monitoring.';
$$;

revoke all on function private.operational_attention_admin_queue_failure_body(text) from public;

create or replace function private.operational_attention_hr_queue_failure_body(
  p_category text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    coalesce(
      private.hr_email_failure_display_label(p_category),
      'Operational email'
    )
    || ' delivery failed. Review provider order workflows.';
$$;

revoke all on function private.operational_attention_hr_queue_failure_body(text) from public;

create or replace function private.sync_oa_admin_queue_fail(
  p_failed_queue_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue private.email_delivery_queue%rowtype;
  v_admin record;
  v_created integer := 0;
  v_body text;
  v_idempotency_key text;
begin
  if p_failed_queue_id is null then
    return 0;
  end if;

  select *
  into v_queue
  from private.email_delivery_queue q
  where q.id = p_failed_queue_id;

  if not found or v_queue.status <> 'failed' then
    return 0;
  end if;

  if private.email_queue_last_error_is_superseded(v_queue.last_error) then
    return 0;
  end if;

  if private.email_queue_failure_alert_loop_excluded(v_queue.message_type) then
    return 0;
  end if;

  v_body := private.operational_attention_admin_queue_failure_body(v_queue.message_type);

  for v_admin in
    select p.id as profile_id
    from public.profiles p
    where p.role in ('admin', 'owner')
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_admin.profile_id,
      'admin.email_delivery_failure'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'admin.email_delivery_failure:'
      || p_failed_queue_id::text
      || ':'
      || v_admin.profile_id::text;

    perform private.create_operational_attention_item(
      v_admin.profile_id,
      'admin.email_delivery_failure',
      'Email delivery failure',
      v_body,
      '/admin/settings/email/delivery/history',
      v_idempotency_key,
      p_failed_email_queue_id => p_failed_queue_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_oa_admin_queue_fail(uuid) from public;

create or replace function private.sync_oa_hr_queue_fail(
  p_failed_queue_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue private.email_delivery_queue%rowtype;
  v_category text;
  v_hr record;
  v_created integer := 0;
  v_body text;
  v_href text;
  v_idempotency_key text;
begin
  if p_failed_queue_id is null then
    return 0;
  end if;

  select *
  into v_queue
  from private.email_delivery_queue q
  where q.id = p_failed_queue_id;

  if not found or v_queue.status <> 'failed' then
    return 0;
  end if;

  v_category := private.email_queue_hr_failure_business_category(p_failed_queue_id);

  if v_category is null then
    return 0;
  end if;

  v_body := private.operational_attention_hr_queue_failure_body(v_category);

  v_href := case v_category
    when 'supplemental_late_order' then '/admin/late-orders'
    else '/admin/todays-orders'
  end;

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_hr.profile_id,
      'hr.email_delivery_failure'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'hr.email_delivery_failure:'
      || p_failed_queue_id::text
      || ':'
      || v_hr.profile_id::text;

    perform private.create_operational_attention_item(
      v_hr.profile_id,
      'hr.email_delivery_failure',
      'Email delivery failure',
      v_body,
      v_href,
      v_idempotency_key,
      p_failed_email_queue_id => p_failed_queue_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_oa_hr_queue_fail(uuid) from public;

create or replace function private.sync_oa_admin_supp_dispatch_fail(
  p_dispatch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_created integer := 0;
  v_idempotency_key text;
begin
  if p_dispatch_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.provider_late_order_dispatches d
    where d.id = p_dispatch_id
      and d.status = 'failed'
  ) then
    return 0;
  end if;

  for v_admin in
    select p.id as profile_id
    from public.profiles p
    where p.role in ('admin', 'owner')
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_admin.profile_id,
      'admin.email_delivery_failure'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'admin.email_delivery_failure:provider_dispatch:'
      || p_dispatch_id::text
      || ':'
      || v_admin.profile_id::text;

    perform private.create_operational_attention_item(
      v_admin.profile_id,
      'admin.email_delivery_failure',
      'Provider dispatch failure',
      'Provider supplemental late-order email dispatch failed. Review Late Orders.',
      '/admin/late-orders',
      v_idempotency_key,
      p_failed_provider_dispatch_id => p_dispatch_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_oa_admin_supp_dispatch_fail(uuid) from public;

create or replace function private.sync_oa_hr_supp_dispatch_fail(
  p_dispatch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hr record;
  v_created integer := 0;
  v_idempotency_key text;
begin
  if p_dispatch_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.provider_late_order_dispatches d
    where d.id = p_dispatch_id
      and d.status = 'failed'
  ) then
    return 0;
  end if;

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_hr.profile_id,
      'hr.email_delivery_failure'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'hr.email_delivery_failure:provider_dispatch:'
      || p_dispatch_id::text
      || ':'
      || v_hr.profile_id::text;

    perform private.create_operational_attention_item(
      v_hr.profile_id,
      'hr.email_delivery_failure',
      'Provider dispatch failure',
      'Provider supplemental late-order email dispatch failed. Review Late Orders.',
      '/admin/late-orders',
      v_idempotency_key,
      p_failed_provider_dispatch_id => p_dispatch_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_oa_hr_supp_dispatch_fail(uuid) from public;

create or replace function private.sync_oa_admin_primary_dispatch_fail(
  p_dispatch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_created integer := 0;
  v_idempotency_key text;
begin
  if p_dispatch_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.provider_primary_order_dispatches d
    where d.id = p_dispatch_id
      and d.status = 'failed'
  ) then
    return 0;
  end if;

  for v_admin in
    select p.id as profile_id
    from public.profiles p
    where p.role in ('admin', 'owner')
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_admin.profile_id,
      'admin.email_delivery_failure'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'admin.email_delivery_failure:primary_dispatch:'
      || p_dispatch_id::text
      || ':'
      || v_admin.profile_id::text;

    perform private.create_operational_attention_item(
      v_admin.profile_id,
      'admin.email_delivery_failure',
      'Provider dispatch failure',
      'Provider primary lunch-order email dispatch failed. Review Today''s Orders.',
      '/admin/todays-orders',
      v_idempotency_key,
      p_failed_provider_primary_dispatch_id => p_dispatch_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_oa_admin_primary_dispatch_fail(uuid) from public;

create or replace function private.sync_oa_hr_primary_dispatch_fail(
  p_dispatch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hr record;
  v_created integer := 0;
  v_idempotency_key text;
begin
  if p_dispatch_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.provider_primary_order_dispatches d
    where d.id = p_dispatch_id
      and d.status = 'failed'
  ) then
    return 0;
  end if;

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_hr.profile_id,
      'hr.email_delivery_failure'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'hr.email_delivery_failure:primary_dispatch:'
      || p_dispatch_id::text
      || ':'
      || v_hr.profile_id::text;

    perform private.create_operational_attention_item(
      v_hr.profile_id,
      'hr.email_delivery_failure',
      'Provider dispatch failure',
      'Provider primary lunch-order email dispatch failed. Review Today''s Orders.',
      '/admin/todays-orders',
      v_idempotency_key,
      p_failed_provider_primary_dispatch_id => p_dispatch_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_oa_hr_primary_dispatch_fail(uuid) from public;

create or replace function private.safe_sync_oa_terminal_queue_fail(
  p_failed_queue_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_oa_admin_queue_fail(p_failed_queue_id);
  perform private.sync_oa_hr_queue_fail(p_failed_queue_id);
exception
  when others then
    raise warning 'safe_sync_oa_terminal_queue_fail failed for %: %',
      p_failed_queue_id, sqlerrm;
end;
$$;

revoke all on function private.safe_sync_oa_terminal_queue_fail(uuid) from public;

create or replace function private.safe_sync_oa_supp_dispatch_fail(
  p_dispatch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_oa_admin_supp_dispatch_fail(p_dispatch_id);
  perform private.sync_oa_hr_supp_dispatch_fail(p_dispatch_id);
exception
  when others then
    raise warning 'safe_sync_oa_supp_dispatch_fail failed for %: %',
      p_dispatch_id, sqlerrm;
end;
$$;

revoke all on function private.safe_sync_oa_supp_dispatch_fail(uuid) from public;

create or replace function private.safe_sync_oa_primary_dispatch_fail(
  p_dispatch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_oa_admin_primary_dispatch_fail(p_dispatch_id);
  perform private.sync_oa_hr_primary_dispatch_fail(p_dispatch_id);
exception
  when others then
    raise warning 'safe_sync_oa_primary_dispatch_fail failed for %: %',
      p_dispatch_id, sqlerrm;
end;
$$;

revoke all on function private.safe_sync_oa_primary_dispatch_fail(uuid) from public;

create or replace function private.trg_oa_resolve_email_queue_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'failed'
     and new.status is distinct from old.status
     and private.oa_delivery_failure_recovered(new.status) then
    perform private.resolve_operational_attention_for_email_queue_failure(old.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_oa_resolve_email_queue_status() from public;

drop trigger if exists operational_attention_resolve_email_queue_status on private.email_delivery_queue;

create trigger operational_attention_resolve_email_queue_status
  after update of status on private.email_delivery_queue
  for each row
  execute function private.trg_oa_resolve_email_queue_status();

create or replace function private.trg_oa_resolve_supp_dispatch_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'failed'
     and new.status is distinct from old.status
     and private.oa_delivery_failure_recovered(new.status) then
    perform private.resolve_operational_attention_for_provider_dispatch_failure(old.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_oa_resolve_supp_dispatch_status() from public;

drop trigger if exists operational_attention_resolve_provider_dispatch_status
  on public.provider_late_order_dispatches;

create trigger operational_attention_resolve_provider_dispatch_status
  after update of status on public.provider_late_order_dispatches
  for each row
  execute function private.trg_oa_resolve_supp_dispatch_status();

create or replace function private.trg_oa_resolve_primary_dispatch_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'failed'
     and new.status is distinct from old.status
     and private.oa_delivery_failure_recovered(new.status) then
    perform private.resolve_operational_attention_for_primary_dispatch_failure(old.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_oa_resolve_primary_dispatch_status() from public;

drop trigger if exists operational_attention_resolve_primary_dispatch_status
  on public.provider_primary_order_dispatches;

create trigger operational_attention_resolve_primary_dispatch_status
  after update of status on public.provider_primary_order_dispatches
  for each row
  execute function private.trg_oa_resolve_primary_dispatch_status();

-- Hook operational attention into existing safe failure notify entrypoints (email unchanged).

create or replace function private.safe_notify_terminal_email_delivery_failures(p_failed_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_admin_email_delivery_queue_failure(p_failed_queue_id);
  perform private.notify_hr_email_delivery_queue_failure(p_failed_queue_id);
  perform private.safe_sync_oa_terminal_queue_fail(p_failed_queue_id);
exception
  when others then
    raise warning 'safe_notify_terminal_email_delivery_failures failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_terminal_email_delivery_failures(uuid) from public;

create or replace function private.safe_notify_provider_supplement_email_dispatch_failure(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_admin_provider_email_dispatch_failure(
    p_dispatch_id,
    'provider_supplemental_late_order'
  );
  perform private.notify_hr_provider_supplement_email_dispatch_failure(p_dispatch_id);
  perform private.safe_sync_oa_supp_dispatch_fail(p_dispatch_id);
exception
  when others then
    raise warning 'safe_notify_provider_supplement_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_provider_supplement_email_dispatch_failure(uuid) from public;

create or replace function private.safe_notify_provider_primary_email_dispatch_failure(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_admin_provider_primary_email_dispatch_failure(p_dispatch_id);
  perform private.notify_hr_provider_primary_email_dispatch_failure(p_dispatch_id);
  perform private.safe_sync_oa_primary_dispatch_fail(p_dispatch_id);
exception
  when others then
    raise warning 'safe_notify_provider_primary_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_provider_primary_email_dispatch_failure(uuid) from public;
