-- Staff lunch-period finalized notice (Accounts-initiated, optional, not preference-gated).
-- Defer dormant Accounts period recipient events.

update private.notification_event_catalog
set
  display_name = 'Lunch period ready for review (deferred)',
  description = 'Not in use. Accounts performs period review directly; no automatic notice is sent.',
  user_configurable = false,
  default_enabled = false
where event_key = 'accounts.period_ready';

update private.notification_event_catalog
set
  display_name = 'Lunch period finalized (deferred)',
  description = 'Not in use. Accounts finalizes periods in Financial Reports; use Staff period finalized notice instead.',
  user_configurable = false,
  default_enabled = false
where event_key = 'accounts.period_finalized';

update private.notification_settings
set enabled = false
where event_key in ('accounts.period_ready', 'accounts.period_finalized');

delete from private.notification_email_templates
where event_key in ('accounts.period_ready', 'accounts.period_finalized');

insert into private.notification_event_catalog (
  event_key, audience, display_name, description,
  default_enabled, user_configurable, timing_configurable, timing_mode, allowed_variables
)
values (
  'staff.lunch_period_finalized',
  'staff',
  'Lunch period finalized',
  'Organization notice sent by Accounts after a lunch period is finalized. Not controlled by personal staff preferences.',
  true,
  false,
  false,
  'immediate',
  array['first_name', 'period_name', 'period_start', 'period_end', 'account_url']
)
on conflict (event_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  user_configurable = excluded.user_configurable,
  allowed_variables = excluded.allowed_variables;

insert into private.notification_settings (event_key, enabled, send_time, minutes_before_deadline)
select
  'staff.lunch_period_finalized',
  true,
  null,
  null
where not exists (
  select 1 from private.notification_settings s where s.event_key = 'staff.lunch_period_finalized'
);

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template, active
)
values (
  'staff.lunch_period_finalized',
  'Lunch period finalized',
  '<p>Hi {{first_name}},</p><p>The lunch period <strong>{{period_name}}</strong> has been finalized.</p><p><strong>Period:</strong><br>{{period_start}} – {{period_end}}</p><p>You can review your lunch activity here:<br><a href="{{account_url}}">{{account_url}}</a></p>',
  'Hi {{first_name}},

The lunch period {{period_name}} has been finalized.

Period:
{{period_start}} – {{period_end}}

You can review your lunch activity here:
{{account_url}}',
  true
)
on conflict (event_key) do update
set
  subject_template = excluded.subject_template,
  body_html_template = excluded.body_html_template,
  body_text_template = excluded.body_text_template,
  active = excluded.active;

alter table private.notification_delivery_log
  add column if not exists lunch_period_id uuid references public.lunch_periods (id) on delete set null;

create index if not exists notification_delivery_log_lunch_period_event_idx
  on private.notification_delivery_log (lunch_period_id, event_key)
  where lunch_period_id is not null;

create or replace function private.staff_lunch_period_finalized_recipient_eligible(
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_active_lunch_ordering_profile(p_profile_id)
    and private.notification_globally_enabled('staff.lunch_period_finalized')
    and exists (
      select 1
      from auth.users u
      where u.id = p_profile_id
        and u.email is not null
        and btrim(u.email) <> ''
        and position('@' in btrim(u.email)) > 0
    )
    and exists (
      select 1
      from private.notification_email_templates t
      where t.event_key = 'staff.lunch_period_finalized'
        and t.active
    );
$$;

revoke all on function private.staff_lunch_period_finalized_recipient_eligible(uuid) from public;

create or replace function public.count_staff_lunch_period_finalized_notice_recipients()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.profiles p
  where private.staff_lunch_period_finalized_recipient_eligible(p.id);
$$;

revoke execute on function public.count_staff_lunch_period_finalized_notice_recipients() from public, anon;
grant execute on function public.count_staff_lunch_period_finalized_notice_recipients() to authenticated;

create or replace function public.get_staff_lunch_period_finalized_notice_summary(
  p_lunch_period_id uuid
)
returns table (
  status text,
  globally_enabled boolean,
  eligible_recipient_count bigint,
  delivery_count bigint,
  pending_count bigint,
  queued_count bigint,
  sent_count bigint,
  failed_count bigint,
  skipped_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_globally_enabled boolean;
begin
  if p_lunch_period_id is null then
    return;
  end if;

  if not (
    select private.can_manage_accounts_operational_data()
    or (select private.can_view_accounts_operational_data())
  ) then
    raise exception 'Accounts access required';
  end if;

  v_globally_enabled := private.notification_globally_enabled('staff.lunch_period_finalized');

  return query
  with stats as (
    select
      count(*)::bigint as total_deliveries,
      count(*) filter (where d.status = 'pending')::bigint as pending_total,
      count(*) filter (where d.status = 'queued')::bigint as queued_total,
      count(*) filter (where d.status = 'sent')::bigint as sent_total,
      count(*) filter (where d.status = 'failed')::bigint as failed_total,
      count(*) filter (where d.status = 'skipped')::bigint as skipped_total
    from private.notification_delivery_log d
    where d.event_key = 'staff.lunch_period_finalized'
      and d.lunch_period_id = p_lunch_period_id
  )
  select
    case
      when s.total_deliveries = 0 then 'not_sent'
      when s.pending_total + s.queued_total > 0 then 'sending'
      when s.failed_total > 0 and s.sent_total > 0 then 'partial_failure'
      when s.failed_total > 0 then 'failed'
      when s.sent_total + s.skipped_total = s.total_deliveries
        and s.total_deliveries > 0 then 'sent'
      else 'generated'
    end,
    v_globally_enabled,
    public.count_staff_lunch_period_finalized_notice_recipients(),
    s.total_deliveries,
    s.pending_total,
    s.queued_total,
    s.sent_total,
    s.failed_total,
    s.skipped_total
  from stats s;
end;
$$;

revoke execute on function public.get_staff_lunch_period_finalized_notice_summary(uuid) from public, anon;
grant execute on function public.get_staff_lunch_period_finalized_notice_summary(uuid) to authenticated;

create or replace function private.generate_staff_lunch_period_finalized_notice_core(
  p_lunch_period_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.lunch_periods%rowtype;
  v_batch_id uuid;
  v_profile record;
  v_idempotency_key text;
  v_created integer := 0;
  v_requeued integer := 0;
  v_inserted integer;
begin
  if p_lunch_period_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_period');
  end if;

  select *
  into v_period
  from public.lunch_periods lp
  where lp.id = p_lunch_period_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'period_not_found');
  end if;

  if v_period.status <> 'finalized' then
    return jsonb_build_object('ok', false, 'code', 'period_not_finalized');
  end if;

  if not private.notification_globally_enabled('staff.lunch_period_finalized') then
    return jsonb_build_object('ok', false, 'code', 'notice_disabled');
  end if;

  select d.batch_id
  into v_batch_id
  from private.notification_delivery_log d
  where d.event_key = 'staff.lunch_period_finalized'
    and d.lunch_period_id = p_lunch_period_id
  order by d.created_at
  limit 1;

  if v_batch_id is null then
    insert into private.notification_delivery_batch (event_key, operational_date)
    values ('staff.lunch_period_finalized', v_period.end_date)
    returning id into v_batch_id;
  end if;

  for v_profile in
    select p.id as profile_id
    from public.profiles p
    where private.staff_lunch_period_finalized_recipient_eligible(p.id)
  loop
    v_idempotency_key :=
      'staff.lunch_period_finalized:'
      || p_lunch_period_id::text
      || ':'
      || v_profile.profile_id::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key,
      lunch_period_id
    )
    values (
      'staff.lunch_period_finalized',
      v_profile.profile_id,
      v_period.end_date,
      v_batch_id,
      'pending',
      v_idempotency_key,
      p_lunch_period_id
    )
    on conflict (idempotency_key) do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;
  end loop;

  update private.notification_delivery_log d
  set
    status = 'pending',
    email_queue_id = null,
    last_error = null,
    rendered_subject = null,
    rendered_text_body = null,
    rendered_html_body = null,
    updated_at = now()
  where d.event_key = 'staff.lunch_period_finalized'
    and d.lunch_period_id = p_lunch_period_id
    and d.status = 'failed';

  get diagnostics v_requeued = row_count;

  return jsonb_build_object(
    'ok', true,
    'code', 'generated',
    'created', v_created,
    'requeued_failed', v_requeued
  );
exception
  when others then
    raise warning 'generate_staff_lunch_period_finalized_notice failed: %', sqlerrm;
    return jsonb_build_object('ok', false, 'code', 'error', 'message', sqlerrm);
end;
$$;

revoke all on function private.generate_staff_lunch_period_finalized_notice_core(uuid) from public;

create or replace function public.generate_staff_lunch_period_finalized_notice(
  p_lunch_period_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_accounts_operational_data()) then
    raise exception 'Accounts access required';
  end if;

  return private.generate_staff_lunch_period_finalized_notice_core(p_lunch_period_id);
end;
$$;

revoke execute on function public.generate_staff_lunch_period_finalized_notice(uuid) from public, anon;
grant execute on function public.generate_staff_lunch_period_finalized_notice(uuid) to authenticated;

create or replace function public.worker_get_staff_lunch_period_finalized_context(
  p_delivery_id uuid
)
returns table (
  first_name text,
  period_name text,
  period_start date,
  period_end date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery private.notification_delivery_log%rowtype;
  v_period public.lunch_periods%rowtype;
  v_full_name text;
  v_email text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_delivery
  from private.notification_delivery_log d
  where d.id = p_delivery_id
    and d.event_key = 'staff.lunch_period_finalized';

  if not found or v_delivery.lunch_period_id is null then
    return;
  end if;

  select *
  into v_period
  from public.lunch_periods lp
  where lp.id = v_delivery.lunch_period_id;

  if not found then
    return;
  end if;

  select p.full_name, u.email
  into v_full_name, v_email
  from public.profiles p
  inner join auth.users u on u.id = p.id
  where p.id = v_delivery.profile_id;

  return query
  select
    coalesce(
      nullif(btrim(split_part(coalesce(v_full_name, ''), ' ', 1)), ''),
      split_part(coalesce(v_email, 'there'), '@', 1)
    ),
    v_period.label,
    v_period.start_date,
    v_period.end_date;
end;
$$;

revoke execute on function public.worker_get_staff_lunch_period_finalized_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_staff_lunch_period_finalized_context(uuid) to service_role;

create or replace function public.worker_list_pending_staff_lunch_period_finalized_deliveries(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  lunch_period_id uuid,
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
    d.lunch_period_id,
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'staff.lunch_period_finalized'
    and d.status = 'pending'
    and d.email_queue_id is null
    and d.lunch_period_id is not null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_staff_lunch_period_finalized_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.worker_list_pending_staff_lunch_period_finalized_deliveries(integer) to service_role;

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
    when 'staff.lunch_period_finalized' then 'notification_lunch_period_finalized'
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
