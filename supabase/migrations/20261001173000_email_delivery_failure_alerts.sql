-- Dual-audience terminal email failure alerts (Admin/Owner technical + HR informational).

alter table private.notification_event_catalog
  drop constraint if exists notification_event_catalog_audience_check;

alter table private.notification_event_catalog
  add constraint notification_event_catalog_audience_check
  check (audience in ('staff', 'hr', 'accounts', 'provider', 'admin'));

alter table private.notification_delivery_log
  add column if not exists failed_email_queue_id uuid,
  add column if not exists failed_provider_dispatch_id uuid references public.provider_late_order_dispatches (id) on delete set null,
  add column if not exists provider_failure_kind text
    check (
      provider_failure_kind is null
      or provider_failure_kind in ('primary_lunch_order', 'supplemental_late_order')
    );

create index if not exists notification_delivery_log_failed_email_queue_id_idx
  on private.notification_delivery_log (failed_email_queue_id)
  where failed_email_queue_id is not null;

create index if not exists notification_delivery_log_failed_provider_dispatch_id_idx
  on private.notification_delivery_log (failed_provider_dispatch_id)
  where failed_provider_dispatch_id is not null;

update private.notification_event_catalog c
set
  display_name = 'Lunch email delivery issue',
  description = 'Informational alert for HR when critical lunch or provider order emails permanently fail. Does not include auth, signup, or routine staff confirmations.',
  allowed_variables = array['email_type', 'recipient', 'failed_at']
where c.event_key = 'hr.email_delivery_failure';

insert into private.notification_event_catalog (
  event_key, audience, display_name, description,
  default_enabled, user_configurable, timing_configurable, timing_mode, allowed_variables
)
values (
  'admin.email_delivery_failure',
  'admin',
  'Email delivery failed',
  'Technical alert when application email permanently fails after all retry attempts. For Admin and Owner investigation.',
  true, false, false, 'immediate',
  array['message_type', 'recipient', 'failed_at', 'error_summary', 'delivery_url']
)
on conflict (event_key) do update
set
  audience = excluded.audience,
  display_name = excluded.display_name,
  description = excluded.description,
  allowed_variables = excluded.allowed_variables;

insert into private.notification_settings (event_key, enabled, send_time, minutes_before_deadline)
select
  'admin.email_delivery_failure',
  true,
  null,
  null
where not exists (
  select 1 from private.notification_settings s where s.event_key = 'admin.email_delivery_failure'
);

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template, active
)
values (
  'hr.email_delivery_failure',
  'Lunch email delivery issue',
  '<p>A lunch-related email could not be delivered after repeated attempts.</p><p><strong>Email type:</strong><br>{{email_type}}</p><p><strong>Recipient:</strong><br>{{recipient}}</p><p><strong>Date:</strong><br>{{failed_at}}</p><p>The lunch order/data in the Lunch Management System is unaffected.</p><p>Admin/Owner has been alerted to investigate the delivery issue.</p>',
  'A lunch-related email could not be delivered after repeated attempts.

Email type:
{{email_type}}

Recipient:
{{recipient}}

Date:
{{failed_at}}

The lunch order/data in the Lunch Management System is unaffected.

Admin/Owner has been alerted to investigate the delivery issue.',
  true
)
on conflict (event_key) do update
set
  subject_template = excluded.subject_template,
  body_html_template = excluded.body_html_template,
  body_text_template = excluded.body_text_template,
  active = excluded.active;

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template, active
)
values (
  'admin.email_delivery_failure',
  'Email delivery failed',
  '<p>An application email could not be delivered after repeated attempts.</p><p><strong>Type:</strong><br>{{message_type}}</p><p><strong>Recipient:</strong><br>{{recipient}}</p><p><strong>Failed:</strong><br>{{failed_at}}</p><p><strong>Error:</strong><br>{{error_summary}}</p><p><a href="{{delivery_url}}">Review Email Delivery</a></p>',
  'An application email could not be delivered after repeated attempts.

Type:
{{message_type}}

Recipient:
{{recipient}}

Failed:
{{failed_at}}

Error:
{{error_summary}}

Review Email Delivery:
{{delivery_url}}',
  true
)
on conflict (event_key) do update
set
  subject_template = excluded.subject_template,
  body_html_template = excluded.body_html_template,
  body_text_template = excluded.body_text_template,
  active = excluded.active;

create or replace function private.email_queue_failure_alert_loop_excluded(p_message_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(p_message_type), '') in (
    'notification_admin_email_delivery_failure',
    'notification_hr_email_delivery_failure'
  );
$$;

revoke all on function private.email_queue_failure_alert_loop_excluded(text) from public;

create or replace function private.admin_technical_notification_recipient_eligible(
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
        and p.role in ('admin', 'owner')
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

revoke all on function private.admin_technical_notification_recipient_eligible(uuid, text) from public;

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

revoke all on function private.email_queue_hr_failure_business_category(uuid) from public;

create or replace function private.hr_email_failure_display_label(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'today_menu' then 'Today''s Menu'
    when 'order_submitted' then 'Order submitted'
    when 'primary_lunch_order' then 'Provider lunch orders'
    when 'supplemental_late_order' then 'Provider supplemental late orders'
    else null
  end;
$$;

revoke all on function private.hr_email_failure_display_label(text) from public;

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

revoke all on function private.notify_admin_email_delivery_queue_failure(uuid) from public;

create or replace function private.notify_hr_email_delivery_queue_failure(p_failed_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_operational_date date;
  v_batch_id uuid;
  v_hr record;
  v_idempotency_key text;
begin
  if p_failed_queue_id is null then
    return;
  end if;

  if not private.notification_globally_enabled('hr.email_delivery_failure') then
    return;
  end if;

  v_category := private.email_queue_hr_failure_business_category(p_failed_queue_id);

  if v_category is null then
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
      'hr.email_delivery_failure:'
      || p_failed_queue_id::text
      || ':'
      || v_hr.profile_id::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key,
      failed_email_queue_id,
      provider_failure_kind
    )
    values (
      'hr.email_delivery_failure',
      v_hr.profile_id,
      v_operational_date,
      v_batch_id,
      'pending',
      v_idempotency_key,
      p_failed_queue_id,
      case v_category
        when 'primary_lunch_order' then 'primary_lunch_order'
        when 'supplemental_late_order' then 'supplemental_late_order'
        else null
      end
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception
  when others then
    raise warning 'notify_hr_email_delivery_queue_failure failed for queue %: %',
      p_failed_queue_id, sqlerrm;
end;
$$;

revoke all on function private.notify_hr_email_delivery_queue_failure(uuid) from public;

create or replace function private.notify_admin_provider_email_dispatch_failure(
  p_dispatch_id uuid,
  p_message_type text
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
    from public.provider_late_order_dispatches d
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
      'admin.email_delivery_failure:provider_dispatch:'
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
      failed_provider_dispatch_id
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
    raise warning 'notify_admin_provider_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.notify_admin_provider_email_dispatch_failure(uuid, text) from public;

create or replace function private.notify_hr_provider_supplement_email_dispatch_failure(p_dispatch_id uuid)
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
    from public.provider_late_order_dispatches d
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
      'hr.email_delivery_failure:provider_dispatch:'
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
      failed_provider_dispatch_id,
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
      'supplemental_late_order'
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception
  when others then
    raise warning 'notify_hr_provider_supplement_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.notify_hr_provider_supplement_email_dispatch_failure(uuid) from public;

create or replace function private.safe_notify_terminal_email_delivery_failures(p_failed_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_admin_email_delivery_queue_failure(p_failed_queue_id);
  perform private.notify_hr_email_delivery_queue_failure(p_failed_queue_id);
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
exception
  when others then
    raise warning 'safe_notify_provider_supplement_email_dispatch_failure failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_provider_supplement_email_dispatch_failure(uuid) from public;

-- Worker context + pending lists

create or replace function public.worker_get_admin_email_delivery_failure_context(
  p_delivery_id uuid
)
returns table (
  message_type text,
  recipient text,
  failed_at timestamptz,
  error_summary text
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
      q.message_type,
      q.recipient_email,
      coalesce(q.claimed_at, q.created_at),
      left(coalesce(nullif(btrim(q.last_error), ''), 'Delivery failed'), 500)
    from private.email_delivery_queue q
    where q.id = v_delivery.failed_email_queue_id;
    return;
  end if;

  if v_delivery.failed_provider_dispatch_id is not null then
    return query
    select
      'provider_supplemental_late_order'::text,
      coalesce(d.provider_email, 'unknown'),
      coalesce(d.sent_at, d.created_at),
      left(coalesce(nullif(btrim(d.error_summary), ''), 'Delivery failed'), 500)
    from public.provider_late_order_dispatches d
    where d.id = v_delivery.failed_provider_dispatch_id;
  end if;
end;
$$;

revoke execute on function public.worker_get_admin_email_delivery_failure_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_admin_email_delivery_failure_context(uuid) to service_role;

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
  end if;
end;
$$;

revoke execute on function public.worker_get_hr_email_delivery_failure_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_hr_email_delivery_failure_context(uuid) to service_role;

create or replace function public.worker_list_pending_admin_email_delivery_failure_notifications(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  failed_email_queue_id uuid,
  failed_provider_dispatch_id uuid,
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
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'admin.email_delivery_failure'
    and d.status = 'pending'
    and d.email_queue_id is null
    and (d.failed_email_queue_id is not null or d.failed_provider_dispatch_id is not null)
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_admin_email_delivery_failure_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.worker_list_pending_admin_email_delivery_failure_notifications(integer) to service_role;

create or replace function public.worker_list_pending_hr_email_delivery_failure_notifications(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  failed_email_queue_id uuid,
  failed_provider_dispatch_id uuid,
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
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'hr.email_delivery_failure'
    and d.status = 'pending'
    and d.email_queue_id is null
    and (d.failed_email_queue_id is not null or d.failed_provider_dispatch_id is not null)
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_hr_email_delivery_failure_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.worker_list_pending_hr_email_delivery_failure_notifications(integer) to service_role;

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
    when 'admin.email_delivery_failure' then 'notification_admin_email_delivery_failure'
    when 'hr.email_delivery_failure' then 'notification_hr_email_delivery_failure'
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

create or replace function public.list_admin_notification_events(p_audience text)
returns table (
  event_key text,
  display_name text,
  description text,
  global_enabled boolean,
  send_time time,
  minutes_before_deadline integer,
  timing_mode text,
  timing_configurable boolean,
  user_configurable boolean,
  has_template boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_auth_settings()) then
    raise exception 'Notification settings management access required';
  end if;

  if p_audience not in ('staff', 'hr', 'accounts', 'provider', 'admin') then
    raise exception 'Invalid notification audience';
  end if;

  return query
  select
    c.event_key,
    c.display_name,
    c.description,
    coalesce(s.enabled, c.default_enabled) as global_enabled,
    s.send_time,
    s.minutes_before_deadline,
    c.timing_mode,
    c.timing_configurable,
    c.user_configurable,
    exists (
      select 1 from private.notification_email_templates t where t.event_key = c.event_key
    ) as has_template
  from private.notification_event_catalog c
  left join private.notification_settings s on s.event_key = c.event_key
  where c.audience = p_audience
    and c.active
  order by c.display_name asc;
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
    perform private.safe_notify_terminal_email_delivery_failures(p_queue_id);
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

    perform private.safe_notify_provider_supplement_email_dispatch_failure(p_dispatch_id);
  end if;
end;
$$;
