-- Event-driven hr.pending_signup_approval notification delivery.

alter table private.notification_delivery_log
  add column if not exists signup_request_id uuid references private.signup_requests (id) on delete set null;

create index if not exists notification_delivery_log_signup_request_id_idx
  on private.notification_delivery_log (signup_request_id)
  where signup_request_id is not null;

update private.notification_event_catalog c
set allowed_variables = array[
  'requester_name', 'requester_email', 'requested_at', 'review_url'
]
where c.event_key = 'hr.pending_signup_approval';

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template, active
)
values (
  'hr.pending_signup_approval',
  'New signup approval request',
  '<p>A new access request is waiting for HR review.</p><p><strong>Name:</strong><br>{{requester_name}}</p><p><strong>Email:</strong><br>{{requester_email}}</p><p><strong>Requested:</strong><br>{{requested_at}}</p><p><a href="{{review_url}}">Review pending requests</a></p>',
  'A new access request is waiting for HR review.

Name:
{{requester_name}}

Email:
{{requester_email}}

Requested:
{{requested_at}}

Review pending requests:
{{review_url}}',
  true
)
on conflict (event_key) do update
set
  subject_template = excluded.subject_template,
  body_html_template = excluded.body_html_template,
  body_text_template = excluded.body_text_template,
  active = excluded.active;

create or replace function private.hr_operational_notification_recipient_eligible(
  p_profile_id uuid,
  p_event_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.notification_globally_enabled(p_event_key)
    and exists (
      select 1
      from public.profiles p
      inner join auth.users u on u.id = p.id
      where p.id = p_profile_id
        and p.role = 'hr'
        and p.account_status = 'active'
        and u.email is not null
        and btrim(u.email) <> ''
        and position('@' in u.email) > 0
    )
    and exists (
      select 1
      from private.notification_email_templates t
      where t.event_key = p_event_key
        and t.active
    );
$$;

revoke all on function private.hr_operational_notification_recipient_eligible(uuid, text) from public;

create or replace function private.notify_hr_pending_signup_approval(
  p_signup_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.signup_requests%rowtype;
  v_operational_date date;
  v_batch_id uuid;
  v_hr record;
  v_idempotency_key text;
begin
  if p_signup_request_id is null then
    return;
  end if;

  if not private.notification_globally_enabled('hr.pending_signup_approval') then
    return;
  end if;

  select *
  into v_request
  from private.signup_requests sr
  where sr.id = p_signup_request_id;

  if not found or v_request.status <> 'pending' then
    return;
  end if;

  v_operational_date := (v_request.requested_at at time zone 'America/Jamaica')::date;

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.hr_operational_notification_recipient_eligible(
      v_hr.profile_id,
      'hr.pending_signup_approval'
    ) then
      continue;
    end if;

    if v_batch_id is null then
      insert into private.notification_delivery_batch (event_key, operational_date)
      values ('hr.pending_signup_approval', v_operational_date)
      returning id into v_batch_id;
    end if;

    v_idempotency_key :=
      'hr.pending_signup_approval:'
      || p_signup_request_id::text
      || ':'
      || v_hr.profile_id::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key,
      signup_request_id
    )
    values (
      'hr.pending_signup_approval',
      v_hr.profile_id,
      v_operational_date,
      v_batch_id,
      'pending',
      v_idempotency_key,
      p_signup_request_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception
  when others then
    raise warning 'notify_hr_pending_signup_approval failed for request %: %',
      p_signup_request_id, sqlerrm;
end;
$$;

revoke all on function private.notify_hr_pending_signup_approval(uuid) from public;

create or replace function private.safe_notify_hr_pending_signup_approval(
  p_signup_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_hr_pending_signup_approval(p_signup_request_id);
exception
  when others then
    raise warning 'safe_notify_hr_pending_signup_approval failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_hr_pending_signup_approval(uuid) from public;

create or replace function public.request_external_signup(
  p_full_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_normalized text;
  v_domain text;
  v_request_id uuid;
begin
  v_name := nullif(btrim(p_full_name), '');
  v_normalized := private.normalize_signup_email(p_email);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

  if v_normalized is null
     or v_normalized !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  v_domain := private.extract_signup_email_domain(v_normalized);

  if v_domain is not null
     and private.is_active_company_signup_domain(v_domain) then
    return jsonb_build_object('ok', false, 'code', 'company_email');
  end if;

  if private.signup_email_has_application_account(v_normalized) then
    return jsonb_build_object(
      'ok', false,
      'code', 'unavailable',
      'message', 'This email address cannot be used for a new access request.'
    );
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'pending'
  ) then
    return jsonb_build_object('ok', true, 'code', 'already_pending');
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'approved'
      and sr.created_profile_id is null
  ) then
    return jsonb_build_object('ok', true, 'code', 'already_approved');
  end if;

  insert into private.signup_requests (
    email,
    normalized_email,
    full_name,
    status
  )
  values (
    v_normalized,
    v_normalized,
    v_name,
    'pending'
  )
  returning id into v_request_id;

  perform private.safe_notify_hr_pending_signup_approval(v_request_id);

  return jsonb_build_object('ok', true, 'code', 'submitted', 'request_id', v_request_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'code', 'already_pending');
end;
$$;

create or replace function public.worker_get_hr_pending_signup_notification_context(
  p_signup_request_id uuid
)
returns table (
  requester_name text,
  requester_email text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  return query
  select
    sr.full_name,
    sr.email,
    sr.requested_at
  from private.signup_requests sr
  where sr.id = p_signup_request_id
    and sr.status = 'pending';
end;
$$;

revoke execute on function public.worker_get_hr_pending_signup_notification_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_hr_pending_signup_notification_context(uuid) to service_role;

create or replace function public.worker_list_pending_hr_signup_notification_deliveries(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  signup_request_id uuid,
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
    d.signup_request_id,
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'hr.pending_signup_approval'
    and d.status = 'pending'
    and d.email_queue_id is null
    and d.signup_request_id is not null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_hr_signup_notification_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.worker_list_pending_hr_signup_notification_deliveries(integer) to service_role;

create or replace function public.worker_queue_notification_delivery(
  p_delivery_id uuid,
  p_recipient_email text,
  p_subject text,
  p_text_body text,
  p_html_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery private.notification_delivery_log%rowtype;
  v_queue_id uuid;
  v_message_type text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_delivery
  from private.notification_delivery_log d
  where d.id = p_delivery_id
  for update;

  if not found then
    raise exception 'Notification delivery not found';
  end if;

  if v_delivery.status not in ('pending', 'queued') then
    raise exception 'Notification delivery is not queueable';
  end if;

  if v_delivery.email_queue_id is not null then
    return v_delivery.email_queue_id;
  end if;

  v_message_type := case v_delivery.event_key
    when 'staff.today_menu' then 'notification_today_menu'
    when 'staff.deadline_reminder' then 'notification_deadline_reminder'
    when 'hr.pending_signup_approval' then 'notification_hr_pending_signup'
    else 'notification_staff_order'
  end;

  v_queue_id := public.service_enqueue_email_delivery(
    v_message_type,
    p_recipient_email,
    p_subject,
    p_text_body,
    p_html_body,
    'notification_delivery',
    p_delivery_id,
    false
  );

  update private.notification_delivery_log d
  set
    status = 'queued',
    recipient_email = lower(btrim(p_recipient_email)),
    email_queue_id = v_queue_id,
    rendered_subject = p_subject,
    rendered_text_body = p_text_body,
    rendered_html_body = p_html_body
  where d.id = p_delivery_id;

  return v_queue_id;
end;
$$;
