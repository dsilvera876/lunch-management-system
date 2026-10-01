-- Scheduled staff.deadline_reminder: send window, eligibility, worker prepare, template.

create or replace function private.deadline_reminder_grace_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select private.today_menu_grace_minutes();
$$;

revoke all on function private.deadline_reminder_grace_minutes() from public;

create or replace function private.deadline_reminder_send_window(
  p_order_date date,
  p_minutes_before_deadline integer,
  p_as_of timestamptz default now()
)
returns table (
  window_open boolean,
  window_start timestamptz,
  window_end timestamptz,
  reminder_send_time time
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local_date date;
  v_deadline timestamptz;
  v_target timestamptz;
  v_grace_end timestamptz;
begin
  v_local_date := (p_as_of at time zone 'America/Jamaica')::date;

  if v_local_date is distinct from p_order_date then
    return query
    select false, null::timestamptz, null::timestamptz, null::time;
    return;
  end if;

  if p_minutes_before_deadline is null or p_minutes_before_deadline < 1 then
    return query
    select false, null::timestamptz, null::timestamptz, null::time;
    return;
  end if;

  v_deadline := public.order_deadline_for_order_date(p_order_date);
  v_target := v_deadline - make_interval(mins => p_minutes_before_deadline);
  v_grace_end := v_target + make_interval(mins => private.deadline_reminder_grace_minutes());

  return query
  select
    p_as_of >= v_target and p_as_of < v_grace_end,
    v_target,
    v_grace_end,
    (v_target at time zone 'America/Jamaica')::time;
end;
$$;

revoke all on function private.deadline_reminder_send_window(date, integer, timestamptz) from public;

create or replace function private.profile_has_active_lunch_order_for_order_date(
  p_profile_id uuid,
  p_order_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    inner join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = p_profile_id
      and o.status = 'submitted'
      and coalesce(
        public.order_date_for_delivery_date(ld.lunch_date, null),
        ld.order_date
      ) = p_order_date
  );
$$;

revoke all on function private.profile_has_active_lunch_order_for_order_date(uuid, date) from public;

create or replace function private.deadline_reminder_recipient_eligible(
  p_profile_id uuid,
  p_order_date date,
  p_as_of timestamptz default now()
)
returns table (
  eligible boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_email text;
  v_location_id uuid;
begin
  if not private.notification_globally_enabled('staff.deadline_reminder') then
    return query select false, 'globally_disabled';
    return;
  end if;

  select *
  into v_profile
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    return query select false, 'profile_not_found';
    return;
  end if;

  if v_profile.account_status <> 'active' then
    return query select false, 'account_inactive';
    return;
  end if;

  if not private.is_active_lunch_ordering_profile(p_profile_id) then
    return query select false, 'not_lunch_participant';
    return;
  end if;

  select u.email
  into v_email
  from auth.users u
  where u.id = p_profile_id;

  if v_email is null or btrim(v_email) = '' or position('@' in v_email) = 0 then
    return query select false, 'no_email';
    return;
  end if;

  if not exists (
    select 1
    from private.notification_email_templates t
    where t.event_key = 'staff.deadline_reminder'
      and t.active
  ) then
    return query select false, 'no_active_template';
    return;
  end if;

  v_location_id := v_profile.default_office_location_id;

  if not public.is_business_day(p_order_date, v_location_id) then
    return query select false, 'business_day_closed';
    return;
  end if;

  if public.is_order_date_in_finalized_period(p_order_date) then
    return query select false, 'period_finalized';
    return;
  end if;

  if not public.is_before_order_deadline(p_order_date, p_as_of) then
    return query select false, 'ordering_closed';
    return;
  end if;

  if not private.order_date_has_staff_menu(p_order_date) then
    return query select false, 'no_applicable_menu';
    return;
  end if;

  if private.profile_has_active_lunch_order_for_order_date(p_profile_id, p_order_date) then
    return query select false, 'already_ordered';
    return;
  end if;

  if not private.effective_staff_notification_preference(p_profile_id, 'staff.deadline_reminder') then
    return query select false, 'preference_disabled';
    return;
  end if;

  return query select true, null::text;
end;
$$;

revoke all on function private.deadline_reminder_recipient_eligible(uuid, date, timestamptz) from public;

update private.notification_event_catalog c
set allowed_variables = array[
  'first_name', 'order_date', 'ordering_deadline', 'order_url'
]
where c.event_key = 'staff.deadline_reminder';

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template, active
)
values (
  'staff.deadline_reminder',
  'Lunch ordering closes soon',
  '<p>Hi {{first_name}},</p><p>Lunch ordering for <strong>{{order_date}}</strong> closes at <strong>{{ordering_deadline}}</strong>.</p><p>You have not placed a lunch order yet.</p><p>View today''s menu and place your order here:<br><a href="{{order_url}}">{{order_url}}</a></p>',
  'Hi {{first_name}},

Lunch ordering for {{order_date}} closes at {{ordering_deadline}}.

You have not placed a lunch order yet.

View today''s menu and place your order here:
{{order_url}}',
  true
)
on conflict (event_key) do update
set
  subject_template = excluded.subject_template,
  body_html_template = excluded.body_html_template,
  body_text_template = excluded.body_text_template,
  active = excluded.active;

create unique index if not exists notification_delivery_batch_deadline_reminder_occurrence_idx
  on private.notification_delivery_batch (event_key, operational_date)
  where event_key = 'staff.deadline_reminder';

create unique index if not exists notification_delivery_log_deadline_reminder_occurrence_idx
  on private.notification_delivery_log (event_key, profile_id, operational_date)
  where event_key = 'staff.deadline_reminder';

create or replace function public.worker_prepare_deadline_reminder_batch(
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_minutes_before integer;
  v_window_open boolean;
  v_reminder_send_time time;
  v_batch_id uuid;
  v_inserted integer := 0;
  v_candidates integer := 0;
  v_eligible_count integer := 0;
  v_profile record;
  v_eligible boolean;
  v_reason text;
  v_new_delivery_id uuid;
  v_skip_reason_counts jsonb := '{}'::jsonb;
  v_delivery_count integer := 0;
  v_processing_run_id uuid;
  v_processing_status text;
  v_prepare_reason text;
  v_idempotency_key text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_order_date := (p_as_of at time zone 'America/Jamaica')::date;

  if not private.notification_globally_enabled('staff.deadline_reminder') then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'globally_disabled',
      'order_date', v_order_date
    );
  end if;

  select s.minutes_before_deadline
  into v_minutes_before
  from private.notification_settings s
  where s.event_key = 'staff.deadline_reminder';

  if v_minutes_before is null then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'missing_minutes_before_deadline',
      'order_date', v_order_date
    );
  end if;

  select w.window_open, w.reminder_send_time
  into v_window_open, v_reminder_send_time
  from private.deadline_reminder_send_window(v_order_date, v_minutes_before, p_as_of) w;

  if not coalesce(v_window_open, false) then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'outside_window',
      'order_date', v_order_date,
      'send_time', v_reminder_send_time::text,
      'minutes_before_deadline', v_minutes_before,
      'window_open', false
    );
  end if;

  if not private.order_date_has_staff_menu(v_order_date) then
    v_processing_run_id := private.upsert_notification_processing_run(
      'staff.deadline_reminder',
      v_order_date,
      v_reminder_send_time,
      0,
      0,
      0,
      0,
      'skipped',
      'no_applicable_menu',
      '{}'::jsonb,
      null
    );

    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'no_applicable_menu',
      'order_date', v_order_date,
      'send_time', v_reminder_send_time::text,
      'window_open', true,
      'processing_run_id', v_processing_run_id
    );
  end if;

  select count(*)::integer
  into v_candidates
  from public.profiles p
  where private.is_active_lunch_ordering_profile(p.id);

  for v_profile in
    select p.id
    from public.profiles p
    where private.is_active_lunch_ordering_profile(p.id)
  loop
    select e.eligible, e.reason
    into v_eligible, v_reason
    from private.deadline_reminder_recipient_eligible(v_profile.id, v_order_date, p_as_of) e;

    if not v_eligible then
      v_skip_reason_counts := private.notification_skip_reason_increment(
        v_skip_reason_counts,
        coalesce(v_reason, 'unknown')
      );
      continue;
    end if;

    v_eligible_count := v_eligible_count + 1;

    if v_batch_id is null then
      begin
        insert into private.notification_delivery_batch (event_key, operational_date)
        values ('staff.deadline_reminder', v_order_date)
        returning id into v_batch_id;
      exception
        when unique_violation then
          select b.id
          into v_batch_id
          from private.notification_delivery_batch b
          where b.event_key = 'staff.deadline_reminder'
            and b.operational_date = v_order_date;
      end;
    end if;

    v_idempotency_key :=
      'staff.deadline_reminder:' || v_profile.id::text || ':' || v_order_date::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key
    )
    values (
      'staff.deadline_reminder',
      v_profile.id,
      v_order_date,
      v_batch_id,
      'pending',
      v_idempotency_key
    )
    on conflict (idempotency_key) do nothing
    returning id into v_new_delivery_id;

    if v_new_delivery_id is not null then
      v_inserted := v_inserted + 1;
    else
      v_skip_reason_counts := private.notification_skip_reason_increment(
        v_skip_reason_counts,
        'already_generated'
      );
    end if;
  end loop;

  if v_batch_id is not null then
    select count(*)::integer
    into v_delivery_count
    from private.notification_delivery_log d
    where d.batch_id = v_batch_id;

    if v_delivery_count = 0 then
      delete from private.notification_delivery_batch b
      where b.id = v_batch_id;
      v_batch_id := null;
    end if;
  end if;

  if v_batch_id is null and v_inserted = 0 then
    v_processing_status := 'skipped';
    v_prepare_reason := 'no_eligible_recipients';

    v_processing_run_id := private.upsert_notification_processing_run(
      'staff.deadline_reminder',
      v_order_date,
      v_reminder_send_time,
      v_candidates,
      v_eligible_count,
      0,
      0,
      v_processing_status,
      v_prepare_reason,
      v_skip_reason_counts,
      null
    );

    return jsonb_build_object(
      'action', 'skipped',
      'reason', v_prepare_reason,
      'order_date', v_order_date,
      'send_time', v_reminder_send_time::text,
      'window_open', true,
      'candidates', v_candidates,
      'eligible_count', v_eligible_count,
      'inserted', 0,
      'skip_reason_counts', v_skip_reason_counts,
      'processing_run_id', v_processing_run_id
    );
  end if;

  v_processing_status := case
    when v_inserted > 0 then 'generated'
    else 'skipped'
  end;
  v_prepare_reason := null;

  v_processing_run_id := private.upsert_notification_processing_run(
    'staff.deadline_reminder',
    v_order_date,
    v_reminder_send_time,
    v_candidates,
    v_eligible_count,
    v_inserted,
    0,
    v_processing_status,
    v_prepare_reason,
    v_skip_reason_counts,
    v_batch_id
  );

  return jsonb_build_object(
    'action', 'prepared',
    'batch_id', v_batch_id,
    'order_date', v_order_date,
    'send_time', v_reminder_send_time::text,
    'window_open', true,
    'candidates', v_candidates,
    'eligible_count', v_eligible_count,
    'inserted', v_inserted,
    'skip_reason_counts', v_skip_reason_counts,
    'processing_run_id', v_processing_run_id
  );
end;
$$;

revoke execute on function public.worker_prepare_deadline_reminder_batch(timestamptz)
  from public, anon, authenticated;
grant execute on function public.worker_prepare_deadline_reminder_batch(timestamptz) to service_role;

create or replace function public.worker_list_pending_deadline_reminder_deliveries(
  p_limit integer default 100
)
returns table (
  delivery_id uuid,
  profile_id uuid,
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
    d.profile_id,
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = 'staff.deadline_reminder'
    and d.status = 'pending'
    and d.email_queue_id is null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_deadline_reminder_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.worker_list_pending_deadline_reminder_deliveries(integer) to service_role;

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
