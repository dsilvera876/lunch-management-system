-- Harden hr.late_order_submitted suppression: superseded queue rows must not trigger SMTP failure alerts.

create or replace function private.email_queue_last_error_is_superseded(p_last_error text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(p_last_error), '') like 'Superseded:%';
$$;

revoke all on function private.email_queue_last_error_is_superseded(text) from public;

create or replace function private.email_queue_failure_is_superseded(p_queue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select private.email_queue_last_error_is_superseded(q.last_error)
      from private.email_delivery_queue q
      where q.id = p_queue_id
    ),
    false
  );
$$;

revoke all on function private.email_queue_failure_is_superseded(uuid) from public;

create or replace function private.notify_admin_email_delivery_queue_failure(p_failed_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue private.email_delivery_queue%rowtype;
  v_operational_date date;
  v_batch_id uuid;
  v_admin record;
  v_idempotency_key text;
begin
  if p_failed_queue_id is null then
    return;
  end if;

  if not private.notification_globally_enabled('admin.email_delivery_failure') then
    return;
  end if;

  select *
  into v_queue
  from private.email_delivery_queue q
  where q.id = p_failed_queue_id;

  if not found or v_queue.status <> 'failed' then
    return;
  end if;

  if private.email_queue_last_error_is_superseded(v_queue.last_error) then
    return;
  end if;

  if private.email_queue_failure_alert_loop_excluded(v_queue.message_type) then
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
      'admin.email_delivery_failure:'
      || p_failed_queue_id::text
      || ':'
      || v_admin.profile_id::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key,
      failed_email_queue_id
    )
    values (
      'admin.email_delivery_failure',
      v_admin.profile_id,
      v_operational_date,
      v_batch_id,
      'pending',
      v_idempotency_key,
      p_failed_queue_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception
  when others then
    raise warning 'notify_admin_email_delivery_queue_failure failed for queue %: %',
      p_failed_queue_id, sqlerrm;
end;
$$;

create or replace function private.email_queue_hr_failure_business_category(p_queue_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row private.email_delivery_queue%rowtype;
  v_event_key text;
begin
  select *
  into v_row
  from private.email_delivery_queue q
  where q.id = p_queue_id;

  if not found or v_row.status <> 'failed' then
    return null;
  end if;

  if private.email_queue_last_error_is_superseded(v_row.last_error) then
    return null;
  end if;

  if private.email_queue_failure_alert_loop_excluded(v_row.message_type) then
    return null;
  end if;

  if v_row.message_type = 'notification_today_menu' then
    return 'today_menu';
  end if;

  if v_row.message_type = 'provider_primary_lunch_order' then
    return 'primary_lunch_order';
  end if;

  if v_row.message_type = 'provider_supplemental_late_order' then
    return 'supplemental_late_order';
  end if;

  if v_row.message_type = 'notification_staff_order'
     and v_row.correlation_type = 'notification_delivery'
     and v_row.correlation_id is not null then
    select d.event_key
    into v_event_key
    from private.notification_delivery_log d
    where d.id = v_row.correlation_id;

    if v_event_key = 'staff.order_submitted' then
      return 'order_submitted';
    end if;
  end if;

  return null;
end;
$$;

create or replace function private.sync_notification_delivery_from_queue(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue private.email_delivery_queue%rowtype;
  v_delivery_id uuid;
  v_retry_count integer;
begin
  select *
  into v_queue
  from private.email_delivery_queue q
  where q.id = p_queue_id;

  if not found or v_queue.correlation_type <> 'notification_delivery' then
    return;
  end if;

  v_delivery_id := v_queue.correlation_id;

  if v_queue.status = 'sent' then
    v_retry_count := greatest(v_queue.attempts - 1, 0);

    update private.notification_delivery_log d
    set
      status = 'sent',
      sent_at = coalesce(v_queue.sent_at, now()),
      transport_attempts = v_queue.attempts,
      last_error = null
    where d.id = v_delivery_id;

    return;
  end if;

  if v_queue.status = 'failed' then
    if private.email_queue_last_error_is_superseded(v_queue.last_error) then
      update private.notification_delivery_log d
      set
        status = 'skipped',
        transport_attempts = v_queue.attempts,
        last_error = left(coalesce(v_queue.last_error, 'Superseded'), 500),
        updated_at = now()
      where d.id = v_delivery_id
        and d.status <> 'sent';

      return;
    end if;

    update private.notification_delivery_log d
    set
      status = 'failed',
      transport_attempts = v_queue.attempts,
      last_error = left(coalesce(v_queue.last_error, 'Email delivery failed'), 500)
    where d.id = v_delivery_id;

    return;
  end if;

  if v_queue.status = 'pending' and v_queue.attempts > 0 then
    update private.notification_delivery_log d
    set
      status = 'queued',
      transport_attempts = v_queue.attempts,
      last_error = left(coalesce(v_queue.last_error, d.last_error), 500)
    where d.id = v_delivery_id
      and d.status in ('queued', 'pending');
  end if;
end;
$$;

create or replace function public.worker_should_deliver_email_queue_message(p_queue_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row private.email_delivery_queue;
  v_email text;
begin
  select *
  into v_row
  from private.email_delivery_queue q
  where q.id = p_queue_id;

  if not found then
    return false;
  end if;

  if v_row.status <> 'processing' then
    return false;
  end if;

  if private.email_queue_last_error_is_superseded(v_row.last_error) then
    return false;
  end if;

  v_email := lower(btrim(v_row.recipient_email));

  if v_row.correlation_type = 'signup_request'
     and v_row.correlation_id is not null then
    if not exists (
      select 1
      from private.signup_requests sr
      where sr.id = v_row.correlation_id
        and sr.status = 'approved'
    ) then
      return false;
    end if;
  end if;

  if v_row.message_type in ('auth_hook', 'account_setup_invite')
     and v_row.correlation_type is distinct from 'signup_request' then
    if not private.signup_email_has_application_account(v_email)
       and not exists (
         select 1
         from private.signup_requests sr
         where sr.normalized_email = v_email
           and sr.status = 'approved'
       ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

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

  if v_row.status = 'failed'
     and private.email_queue_last_error_is_superseded(v_row.last_error) then
    perform private.sync_notification_delivery_from_queue(p_queue_id);
    return;
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

    perform private.sync_notification_delivery_from_queue(p_queue_id);
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

    perform private.sync_notification_delivery_from_queue(p_queue_id);

    if not private.email_queue_failure_is_superseded(p_queue_id) then
      perform private.safe_notify_terminal_email_delivery_failures(p_queue_id);
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

  perform private.sync_notification_delivery_from_queue(p_queue_id);
end;
$$;

create or replace function private.suppress_unsent_hr_late_order_submitted_deliveries(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null then
    return;
  end if;

  update private.notification_delivery_log d
  set
    status = 'skipped',
    last_error = 'Superseded: staff late-order request is no longer pending.',
    updated_at = now()
  where d.event_key = 'hr.late_order_submitted'
    and d.staff_late_order_request_id = p_request_id
    and d.status in ('pending', 'queued')
    and (
      d.email_queue_id is null
      or not exists (
        select 1
        from private.email_delivery_queue q
        where q.id = d.email_queue_id
          and q.status = 'sent'
      )
    );

  update private.email_delivery_queue q
  set
    status = 'failed',
    last_error = 'Superseded: staff late-order request is no longer pending.'
  from private.notification_delivery_log d
  where d.staff_late_order_request_id = p_request_id
    and d.event_key = 'hr.late_order_submitted'
    and d.email_queue_id = q.id
    and d.status = 'skipped'
    and q.status in ('pending', 'processing');
end;
$$;
