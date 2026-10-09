-- Operational Notification Bell (Phase 1): attention rows, inbox RPCs, purge worker.
-- Independent of email templates, delivery log mutation, and recipient email availability.

create table private.operational_attention_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_key text not null,
  title text not null,
  body text not null,
  action_href text not null,
  idempotency_key text not null,
  signup_request_id uuid references private.signup_requests (id) on delete set null,
  staff_late_order_request_id uuid references private.staff_late_order_requests (id) on delete set null,
  failed_email_queue_id uuid references private.email_delivery_queue (id) on delete set null,
  failed_provider_dispatch_id uuid references public.provider_late_order_dispatches (id) on delete set null,
  failed_provider_primary_dispatch_id uuid references public.provider_primary_order_dispatches (id) on delete set null,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_attention_items_event_key_check check (
    event_key in (
      'hr.pending_signup_approval',
      'hr.late_order_submitted',
      'hr.email_delivery_failure',
      'admin.email_delivery_failure'
    )
  ),
  constraint operational_attention_items_title_check check (
    char_length(btrim(title)) between 1 and 200
  ),
  constraint operational_attention_items_body_check check (
    char_length(btrim(body)) between 1 and 1000
  ),
  constraint operational_attention_items_action_href_check check (
    char_length(action_href) between 1 and 500
    and action_href like '/admin/%'
    and action_href !~ '[[:space:]]'
    and position('://' in action_href) = 0
    and position('..' in action_href) = 0
  ),
  constraint operational_attention_items_idempotency_key_check check (
    char_length(btrim(idempotency_key)) between 8 and 500
  ),
  constraint operational_attention_items_idempotency_key_unique unique (idempotency_key)
);

create index operational_attention_items_profile_active_idx
  on private.operational_attention_items (profile_id, created_at desc)
  where resolved_at is null;

create trigger operational_attention_items_set_updated_at
  before update on private.operational_attention_items
  for each row
  execute function private.set_updated_at();

revoke all on private.operational_attention_items from public, anon, authenticated;

create or replace function private.operational_attention_retention_interval()
returns interval
language sql
immutable
parallel safe
set search_path = ''
as $$
  select interval '7 days';
$$;

revoke all on function private.operational_attention_retention_interval() from public;

create or replace function private.operational_attention_active_cutoff()
returns timestamptz
language sql
stable
parallel safe
security definer
set search_path = ''
as $$
  select now() - private.operational_attention_retention_interval();
$$;

revoke all on function private.operational_attention_active_cutoff() from public;

create or replace function private.can_access_operational_attention_inbox()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select private.current_user_id())
      and p.account_status = 'active'
      and p.role in ('hr', 'admin', 'owner')
  );
$$;

revoke all on function private.can_access_operational_attention_inbox() from public;

create or replace function private.operational_attention_action_href_valid(
  p_event_key text,
  p_action_href text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    p_action_href is not null
    and p_action_href like '/admin/%'
    and p_action_href !~ '[[:space:]]'
    and position('://' in p_action_href) = 0
    and position('..' in p_action_href) = 0
    and case p_event_key
      when 'hr.pending_signup_approval' then
        p_action_href like '/admin/users%'
      when 'hr.late_order_submitted' then
        p_action_href like '/admin/late-orders%'
      when 'hr.email_delivery_failure' then
        p_action_href like '/admin/todays-orders%'
        or p_action_href like '/admin/late-orders%'
      when 'admin.email_delivery_failure' then
        p_action_href like '/admin/settings/email/delivery%'
        or p_action_href like '/admin/todays-orders%'
        or p_action_href like '/admin/late-orders%'
      else false
    end;
$$;

revoke all on function private.operational_attention_action_href_valid(text, text) from public;

create or replace function private.operational_attention_recipient_eligible(
  p_profile_id uuid,
  p_event_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.account_status = 'active'
      and case p_event_key
        when 'hr.pending_signup_approval' then p.role = 'hr'
        when 'hr.late_order_submitted' then p.role = 'hr'
        when 'hr.email_delivery_failure' then p.role = 'hr'
        when 'admin.email_delivery_failure' then p.role in ('admin', 'owner')
        else false
      end
  );
$$;

revoke all on function private.operational_attention_recipient_eligible(uuid, text) from public;

create or replace function private.operational_attention_entity_refs_valid(
  p_event_key text,
  p_signup_request_id uuid,
  p_staff_late_order_request_id uuid,
  p_failed_email_queue_id uuid,
  p_failed_provider_dispatch_id uuid,
  p_failed_provider_primary_dispatch_id uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_event_key
    when 'hr.pending_signup_approval' then
      p_signup_request_id is not null
      and p_staff_late_order_request_id is null
      and p_failed_email_queue_id is null
      and p_failed_provider_dispatch_id is null
      and p_failed_provider_primary_dispatch_id is null
    when 'hr.late_order_submitted' then
      p_staff_late_order_request_id is not null
      and p_signup_request_id is null
      and p_failed_email_queue_id is null
      and p_failed_provider_dispatch_id is null
      and p_failed_provider_primary_dispatch_id is null
    when 'hr.email_delivery_failure' then
      p_signup_request_id is null
      and p_staff_late_order_request_id is null
      and (
        (p_failed_email_queue_id is not null)::int
        + (p_failed_provider_dispatch_id is not null)::int
        + (p_failed_provider_primary_dispatch_id is not null)::int
      ) = 1
    when 'admin.email_delivery_failure' then
      p_signup_request_id is null
      and p_staff_late_order_request_id is null
      and (
        (p_failed_email_queue_id is not null)::int
        + (p_failed_provider_dispatch_id is not null)::int
        + (p_failed_provider_primary_dispatch_id is not null)::int
      ) = 1
    else false
  end;
$$;

revoke all on function private.operational_attention_entity_refs_valid(
  text, uuid, uuid, uuid, uuid, uuid
) from public;

create or replace function private.operational_attention_item_has_entity_ref(
  p_event_key text,
  p_signup_request_id uuid,
  p_staff_late_order_request_id uuid,
  p_failed_email_queue_id uuid,
  p_failed_provider_dispatch_id uuid,
  p_failed_provider_primary_dispatch_id uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select private.operational_attention_entity_refs_valid(
    p_event_key,
    p_signup_request_id,
    p_staff_late_order_request_id,
    p_failed_email_queue_id,
    p_failed_provider_dispatch_id,
    p_failed_provider_primary_dispatch_id
  );
$$;

revoke all on function private.operational_attention_item_has_entity_ref(
  text, uuid, uuid, uuid, uuid, uuid
) from public;

create or replace function private.operational_attention_item_is_active(
  p_resolved_at timestamptz,
  p_created_at timestamptz,
  p_event_key text,
  p_signup_request_id uuid,
  p_staff_late_order_request_id uuid,
  p_failed_email_queue_id uuid,
  p_failed_provider_dispatch_id uuid,
  p_failed_provider_primary_dispatch_id uuid
)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = ''
as $$
  select
    p_resolved_at is null
    and p_created_at >= (select private.operational_attention_active_cutoff())
    and private.operational_attention_item_has_entity_ref(
      p_event_key,
      p_signup_request_id,
      p_staff_late_order_request_id,
      p_failed_email_queue_id,
      p_failed_provider_dispatch_id,
      p_failed_provider_primary_dispatch_id
    );
$$;

revoke all on function private.operational_attention_item_is_active(
  timestamptz, timestamptz, text, uuid, uuid, uuid, uuid, uuid
) from public;

create or replace function private.operational_attention_resolve_when_entity_ref_cleared()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resolved_at is not null then
    return new;
  end if;

  if (old.signup_request_id is not null and new.signup_request_id is null)
    or (old.staff_late_order_request_id is not null and new.staff_late_order_request_id is null)
    or (old.failed_email_queue_id is not null and new.failed_email_queue_id is null)
    or (old.failed_provider_dispatch_id is not null and new.failed_provider_dispatch_id is null)
    or (
      old.failed_provider_primary_dispatch_id is not null
      and new.failed_provider_primary_dispatch_id is null
    )
  then
    new.resolved_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.operational_attention_resolve_when_entity_ref_cleared() from public;

create trigger operational_attention_items_resolve_when_entity_ref_cleared
  before update on private.operational_attention_items
  for each row
  execute function private.operational_attention_resolve_when_entity_ref_cleared();

create or replace function private.create_operational_attention_item(
  p_profile_id uuid,
  p_event_key text,
  p_title text,
  p_body text,
  p_action_href text,
  p_idempotency_key text,
  p_signup_request_id uuid default null,
  p_staff_late_order_request_id uuid default null,
  p_failed_email_queue_id uuid default null,
  p_failed_provider_dispatch_id uuid default null,
  p_failed_provider_primary_dispatch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_key text := btrim(p_idempotency_key);
begin
  if p_profile_id is null then
    raise exception 'profile_id is required';
  end if;

  if not private.operational_attention_recipient_eligible(p_profile_id, p_event_key) then
    raise exception 'Recipient is not eligible for event %', p_event_key;
  end if;

  if not private.operational_attention_action_href_valid(p_event_key, p_action_href) then
    raise exception 'Invalid action_href for event %', p_event_key;
  end if;

  if not private.operational_attention_entity_refs_valid(
    p_event_key,
    p_signup_request_id,
    p_staff_late_order_request_id,
    p_failed_email_queue_id,
    p_failed_provider_dispatch_id,
    p_failed_provider_primary_dispatch_id
  ) then
    raise exception 'Entity references do not match event %', p_event_key;
  end if;

  insert into private.operational_attention_items (
    profile_id,
    event_key,
    title,
    body,
    action_href,
    idempotency_key,
    signup_request_id,
    staff_late_order_request_id,
    failed_email_queue_id,
    failed_provider_dispatch_id,
    failed_provider_primary_dispatch_id
  )
  values (
    p_profile_id,
    p_event_key,
    btrim(p_title),
    btrim(p_body),
    p_action_href,
    v_key,
    p_signup_request_id,
    p_staff_late_order_request_id,
    p_failed_email_queue_id,
    p_failed_provider_dispatch_id,
    p_failed_provider_primary_dispatch_id
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select o.id
  into v_id
  from private.operational_attention_items o
  where o.idempotency_key = v_key
    and o.profile_id = p_profile_id;

  if v_id is not null then
    return v_id;
  end if;

  if exists (
    select 1
    from private.operational_attention_items o
    where o.idempotency_key = v_key
  ) then
    raise exception 'Idempotency key already used for a different recipient';
  end if;

  return null;
end;
$$;

revoke all on function private.create_operational_attention_item(
  uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid
) from public;

create or replace function private.resolve_operational_attention_for_signup_request(
  p_signup_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_signup_request_id is null then
    return 0;
  end if;

  update private.operational_attention_items o
  set resolved_at = now()
  where o.signup_request_id = p_signup_request_id
    and o.resolved_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.resolve_operational_attention_for_signup_request(uuid) from public;

create or replace function private.resolve_operational_attention_for_late_order_request(
  p_staff_late_order_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_staff_late_order_request_id is null then
    return 0;
  end if;

  update private.operational_attention_items o
  set resolved_at = now()
  where o.staff_late_order_request_id = p_staff_late_order_request_id
    and o.resolved_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.resolve_operational_attention_for_late_order_request(uuid) from public;

create or replace function private.resolve_operational_attention_for_email_queue_failure(
  p_failed_email_queue_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_failed_email_queue_id is null then
    return 0;
  end if;

  update private.operational_attention_items o
  set resolved_at = now()
  where o.failed_email_queue_id = p_failed_email_queue_id
    and o.resolved_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.resolve_operational_attention_for_email_queue_failure(uuid) from public;

create or replace function private.resolve_operational_attention_for_provider_dispatch_failure(
  p_failed_provider_dispatch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_failed_provider_dispatch_id is null then
    return 0;
  end if;

  update private.operational_attention_items o
  set resolved_at = now()
  where o.failed_provider_dispatch_id = p_failed_provider_dispatch_id
    and o.resolved_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.resolve_operational_attention_for_provider_dispatch_failure(uuid) from public;

create or replace function private.resolve_operational_attention_for_primary_dispatch_failure(
  p_failed_provider_primary_dispatch_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_failed_provider_primary_dispatch_id is null then
    return 0;
  end if;

  update private.operational_attention_items o
  set resolved_at = now()
  where o.failed_provider_primary_dispatch_id = p_failed_provider_primary_dispatch_id
    and o.resolved_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.resolve_operational_attention_for_primary_dispatch_failure(uuid) from public;

create or replace function public.list_my_operational_attention_items(
  p_limit integer default 20
)
returns table (
  id uuid,
  event_key text,
  title text,
  body text,
  action_href text,
  read_at timestamptz,
  created_at timestamptz,
  signup_request_id uuid,
  staff_late_order_request_id uuid,
  failed_email_queue_id uuid,
  failed_provider_dispatch_id uuid,
  failed_provider_primary_dispatch_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile uuid := private.current_user_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 20));
begin
  if v_profile is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_access_operational_attention_inbox()) then
    raise exception 'Operational attention inbox access required';
  end if;

  return query
  select
    o.id,
    o.event_key,
    o.title,
    o.body,
    o.action_href,
    o.read_at,
    o.created_at,
    o.signup_request_id,
    o.staff_late_order_request_id,
    o.failed_email_queue_id,
    o.failed_provider_dispatch_id,
    o.failed_provider_primary_dispatch_id
  from private.operational_attention_items o
  where o.profile_id = v_profile
    and private.operational_attention_item_is_active(
      o.resolved_at,
      o.created_at,
      o.event_key,
      o.signup_request_id,
      o.staff_late_order_request_id,
      o.failed_email_queue_id,
      o.failed_provider_dispatch_id,
      o.failed_provider_primary_dispatch_id
    )
  order by o.created_at desc, o.id desc
  limit v_limit;
end;
$$;

revoke execute on function public.list_my_operational_attention_items(integer) from public, anon;
grant execute on function public.list_my_operational_attention_items(integer) to authenticated;

create or replace function public.count_my_unread_operational_attention_items()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile uuid := private.current_user_id();
begin
  if v_profile is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_access_operational_attention_inbox()) then
    raise exception 'Operational attention inbox access required';
  end if;

  return (
    select count(*)::bigint
    from private.operational_attention_items o
    where o.profile_id = v_profile
      and o.read_at is null
      and private.operational_attention_item_is_active(
        o.resolved_at,
        o.created_at,
        o.event_key,
        o.signup_request_id,
        o.staff_late_order_request_id,
        o.failed_email_queue_id,
        o.failed_provider_dispatch_id,
        o.failed_provider_primary_dispatch_id
      )
  );
end;
$$;

revoke execute on function public.count_my_unread_operational_attention_items() from public, anon;
grant execute on function public.count_my_unread_operational_attention_items() to authenticated;

create or replace function public.mark_operational_attention_item_read(
  p_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := private.current_user_id();
  v_updated boolean := false;
begin
  if v_profile is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_access_operational_attention_inbox()) then
    raise exception 'Operational attention inbox access required';
  end if;

  if p_item_id is null then
    raise exception 'item_id is required';
  end if;

  update private.operational_attention_items o
  set read_at = coalesce(o.read_at, now())
  where o.id = p_item_id
    and o.profile_id = v_profile
    and private.operational_attention_item_is_active(
      o.resolved_at,
      o.created_at,
      o.event_key,
      o.signup_request_id,
      o.staff_late_order_request_id,
      o.failed_email_queue_id,
      o.failed_provider_dispatch_id,
      o.failed_provider_primary_dispatch_id
    );

  v_updated := found;
  return v_updated;
end;
$$;

revoke execute on function public.mark_operational_attention_item_read(uuid) from public, anon;
grant execute on function public.mark_operational_attention_item_read(uuid) to authenticated;

create or replace function public.mark_all_my_operational_attention_items_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := private.current_user_id();
  v_count integer;
begin
  if v_profile is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_access_operational_attention_inbox()) then
    raise exception 'Operational attention inbox access required';
  end if;

  update private.operational_attention_items o
  set read_at = now()
  where o.profile_id = v_profile
    and o.read_at is null
    and private.operational_attention_item_is_active(
      o.resolved_at,
      o.created_at,
      o.event_key,
      o.signup_request_id,
      o.staff_late_order_request_id,
      o.failed_email_queue_id,
      o.failed_provider_dispatch_id,
      o.failed_provider_primary_dispatch_id
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_all_my_operational_attention_items_read() from public, anon;
grant execute on function public.mark_all_my_operational_attention_items_read() to authenticated;

create or replace function public.worker_purge_expired_operational_attention_items()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  delete from private.operational_attention_items o
  where o.created_at < (select private.operational_attention_active_cutoff());

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.worker_purge_expired_operational_attention_items() from public, anon, authenticated;
grant execute on function public.worker_purge_expired_operational_attention_items() to service_role;
