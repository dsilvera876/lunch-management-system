-- Async email delivery queue for Auth hooks and application mail workers.

alter table private.signup_requests
  add column if not exists invite_queued_at timestamptz;

create table private.email_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  message_type text not null,
  recipient_email text not null,
  subject text not null,
  text_body text not null,
  html_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  correlation_type text,
  correlation_id uuid,
  constraint email_delivery_queue_correlation_pair check (
    (correlation_type is null and correlation_id is null)
    or (correlation_type is not null and correlation_id is not null)
  )
);

create index email_delivery_queue_pending_available_idx
  on private.email_delivery_queue (available_at, created_at)
  where status = 'pending';

create unique index email_delivery_queue_active_correlation_uidx
  on private.email_delivery_queue (correlation_type, correlation_id)
  where status in ('pending', 'processing') and correlation_id is not null;

revoke all on table private.email_delivery_queue from public, anon, authenticated;

create or replace function private.resolve_signup_request_for_invite_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sr.id
  from private.signup_requests sr
  where lower(sr.email) = lower(btrim(p_email))
    and sr.status = 'approved'
  order by sr.requested_at desc
  limit 1;
$$;

revoke all on function private.resolve_signup_request_for_invite_email(text) from public, anon, authenticated;

create or replace function private.mark_signup_request_invite_queued(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.signup_requests sr
  set
    invite_queued_at = now(),
    invite_last_error = null
  where sr.id = p_request_id
    and sr.status = 'approved';
end;
$$;

revoke all on function private.mark_signup_request_invite_queued(uuid) from public, anon, authenticated;

create or replace function private.mark_signup_request_invite_sent(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.signup_requests sr
  set
    invite_sent_at = now(),
    invite_last_error = null
  where sr.id = p_request_id
    and sr.status = 'approved';
end;
$$;

revoke all on function private.mark_signup_request_invite_sent(uuid) from public, anon, authenticated;

create or replace function private.mark_signup_request_invite_failed(
  p_request_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.signup_requests sr
  set invite_last_error = private.sanitize_signup_invite_error(p_error)
  where sr.id = p_request_id
    and sr.status = 'approved';
end;
$$;

revoke all on function private.mark_signup_request_invite_failed(uuid, text) from public, anon, authenticated;

create or replace function public.service_enqueue_email_delivery(
  p_message_type text,
  p_recipient_email text,
  p_subject text,
  p_text_body text,
  p_html_body text,
  p_correlation_type text default null,
  p_correlation_id uuid default null,
  p_supersede_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
  v_request_id uuid;
  v_correlation_type text;
  v_correlation_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_email := lower(btrim(p_recipient_email));
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Invalid recipient email';
  end if;

  if p_subject is null or btrim(p_subject) = '' then
    raise exception 'Invalid email subject';
  end if;

  v_correlation_type := nullif(btrim(p_correlation_type), '');
  v_correlation_id := p_correlation_id;

  if v_correlation_id is null
    and p_message_type in ('auth_hook', 'account_setup_invite')
  then
    v_request_id := private.resolve_signup_request_for_invite_email(v_email);
    if v_request_id is not null then
      v_correlation_type := 'signup_request';
      v_correlation_id := v_request_id;
    end if;
  end if;

  if p_supersede_active
    and v_correlation_type is not null
    and v_correlation_id is not null
  then
    update private.email_delivery_queue q
    set
      status = 'failed',
      last_error = 'Superseded by a newer delivery attempt.'
    where q.correlation_type = v_correlation_type
      and q.correlation_id = v_correlation_id
      and q.status in ('pending', 'processing');
  end if;

  insert into private.email_delivery_queue (
    message_type,
    recipient_email,
    subject,
    text_body,
    html_body,
    correlation_type,
    correlation_id
  )
  values (
    btrim(p_message_type),
    v_email,
    btrim(p_subject),
    p_text_body,
    p_html_body,
    v_correlation_type,
    v_correlation_id
  )
  returning id into v_id;

  if v_correlation_type = 'signup_request' and v_correlation_id is not null then
    perform private.mark_signup_request_invite_queued(v_correlation_id);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.service_enqueue_email_delivery(text, text, text, text, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.service_enqueue_email_delivery(text, text, text, text, text, text, uuid, boolean)
  to service_role;

create or replace function public.worker_claim_email_delivery_queue(p_limit integer default 10)
returns setof private.email_delivery_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  return query
  with candidates as (
    select q.id
    from private.email_delivery_queue q
    where q.status = 'pending'
      and q.available_at <= now()
    order by q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update private.email_delivery_queue q
  set
    status = 'processing',
    claimed_at = now(),
    attempts = q.attempts + 1
  from candidates c
  where q.id = c.id
  returning q.*;
end;
$$;

revoke execute on function public.worker_claim_email_delivery_queue(integer) from public, anon, authenticated;
grant execute on function public.worker_claim_email_delivery_queue(integer) to service_role;

create or replace function public.worker_complete_email_delivery(
  p_queue_id uuid,
  p_outcome text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.email_delivery_queue;
  v_max_attempts constant integer := 5;
  v_backoff_seconds integer;
  v_sanitized_error text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_row
  from private.email_delivery_queue q
  where q.id = p_queue_id
  for update;

  if not found then
    raise exception 'Queue message not found';
  end if;

  if v_row.status <> 'processing' then
    raise exception 'Queue message is not processing';
  end if;

  v_sanitized_error := case
    when p_error is null or btrim(p_error) = '' then null
    else left(regexp_replace(btrim(p_error), '(token_hash|access_token|refresh_token|password|secret)=[^&\s]+', '\1=[redacted]', 'gi'), 500)
  end;

  if p_outcome = 'sent' then
    update private.email_delivery_queue q
    set
      status = 'sent',
      sent_at = now(),
      last_error = null,
      text_body = '[redacted after send]',
      html_body = '[redacted after send]'
    where q.id = p_queue_id;

    if v_row.correlation_type = 'signup_request' and v_row.correlation_id is not null then
      perform private.mark_signup_request_invite_sent(v_row.correlation_id);
    end if;

    return;
  end if;

  if p_outcome <> 'failed' then
    raise exception 'Invalid delivery outcome';
  end if;

  if v_row.attempts >= v_max_attempts then
    update private.email_delivery_queue q
    set
      status = 'failed',
      last_error = coalesce(v_sanitized_error, 'Delivery failed'),
      text_body = '[redacted after failure]',
      html_body = '[redacted after failure]'
    where q.id = p_queue_id;

    if v_row.correlation_type = 'signup_request' and v_row.correlation_id is not null then
      perform private.mark_signup_request_invite_failed(
        v_row.correlation_id,
        coalesce(v_sanitized_error, 'Email delivery failed')
      );
    end if;

    return;
  end if;

  v_backoff_seconds := least(300, 15 * power(2, greatest(v_row.attempts - 1, 0))::integer);

  update private.email_delivery_queue q
  set
    status = 'pending',
    claimed_at = null,
    last_error = coalesce(v_sanitized_error, 'Delivery failed'),
    available_at = now() + make_interval(secs => v_backoff_seconds)
  where q.id = p_queue_id;
end;
$$;

revoke execute on function public.worker_complete_email_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.worker_complete_email_delivery(uuid, text, text) to service_role;
