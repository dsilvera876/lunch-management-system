-- Today''s Menu: lunch-participant eligibility, shared preference resolution, processing audit.

create table private.notification_processing_run (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  operational_date date not null,
  scheduled_send_time time not null,
  first_checked_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  run_count integer not null default 1,
  candidate_count integer not null default 0,
  eligible_count integer not null default 0,
  generated_count integer not null default 0,
  queued_count integer not null default 0,
  processing_status text not null,
  prepare_reason text,
  skip_reason_counts jsonb not null default '{}'::jsonb,
  delivery_batch_id uuid references private.notification_delivery_batch (id) on delete set null,
  constraint notification_processing_run_status_check
    check (processing_status in ('skipped', 'generated', 'partially_generated', 'error')),
  constraint notification_processing_run_occurrence_key
    unique (event_key, operational_date, scheduled_send_time)
);

create index notification_processing_run_last_checked_idx
  on private.notification_processing_run (last_checked_at desc);

revoke all on private.notification_processing_run from public, anon, authenticated;

create or replace function private.is_active_lunch_ordering_profile(p_profile_id uuid)
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
      and p.role = any (array['staff', 'hr', 'accounts', 'admin', 'owner']::text[])
  );
$$;

revoke all on function private.is_active_lunch_ordering_profile(uuid) from public;

create or replace function private.effective_staff_notification_preference(
  p_profile_id uuid,
  p_event_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.enabled
      from private.staff_notification_preferences p
      where p.profile_id = p_profile_id
        and p.event_key = p_event_key
    ),
    (
      select c.default_enabled
      from private.notification_event_catalog c
      where c.event_key = p_event_key
        and c.audience = 'staff'
        and c.user_configurable
        and c.active
    ),
    false
  );
$$;

revoke all on function private.effective_staff_notification_preference(uuid, text) from public;

create or replace function private.notification_staff_preference_enabled(
  p_profile_id uuid,
  p_event_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.effective_staff_notification_preference(p_profile_id, p_event_key);
$$;

create or replace function public.get_my_notification_preferences()
returns table (
  event_key text,
  display_name text,
  description text,
  personal_enabled boolean,
  global_enabled boolean,
  globally_disabled boolean
)
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

  return query
  select
    c.event_key,
    c.display_name,
    c.description,
    private.effective_staff_notification_preference(v_profile, c.event_key) as personal_enabled,
    coalesce(s.enabled, c.default_enabled) as global_enabled,
    not coalesce(s.enabled, c.default_enabled) as globally_disabled
  from private.notification_event_catalog c
  left join private.notification_settings s on s.event_key = c.event_key
  where c.audience = 'staff'
    and c.user_configurable
    and c.active
  order by c.display_name asc;
end;
$$;

create or replace function private.today_menu_recipient_eligible(
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
  if not private.notification_globally_enabled('staff.today_menu') then
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

  v_location_id := v_profile.default_office_location_id;

  if not public.is_business_day(p_order_date, v_location_id) then
    return query select false, 'business_day_closed';
    return;
  end if;

  if public.is_order_date_in_finalized_period(p_order_date) then
    return query select false, 'period_finalized';
    return;
  end if;

  if p_as_of > public.order_deadline_for_order_date(p_order_date) then
    return query select false, 'ordering_closed';
    return;
  end if;

  if not private.order_date_has_staff_menu(p_order_date) then
    return query select false, 'no_applicable_menu';
    return;
  end if;

  if not private.effective_staff_notification_preference(p_profile_id, 'staff.today_menu') then
    return query select false, 'preference_disabled';
    return;
  end if;

  return query select true, null::text;
end;
$$;

create or replace function private.upsert_notification_processing_run(
  p_event_key text,
  p_operational_date date,
  p_scheduled_send_time time,
  p_candidate_count integer,
  p_eligible_count integer,
  p_generated_count integer,
  p_queued_count integer,
  p_processing_status text,
  p_prepare_reason text,
  p_skip_reason_counts jsonb,
  p_delivery_batch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into private.notification_processing_run (
    event_key,
    operational_date,
    scheduled_send_time,
    candidate_count,
    eligible_count,
    generated_count,
    queued_count,
    processing_status,
    prepare_reason,
    skip_reason_counts,
    delivery_batch_id
  )
  values (
    p_event_key,
    p_operational_date,
    p_scheduled_send_time,
    coalesce(p_candidate_count, 0),
    coalesce(p_eligible_count, 0),
    coalesce(p_generated_count, 0),
    coalesce(p_queued_count, 0),
    p_processing_status,
    p_prepare_reason,
    coalesce(p_skip_reason_counts, '{}'::jsonb),
    p_delivery_batch_id
  )
  on conflict on constraint notification_processing_run_occurrence_key
  do update set
    last_checked_at = now(),
    run_count = private.notification_processing_run.run_count + 1,
    candidate_count = excluded.candidate_count,
    eligible_count = excluded.eligible_count,
    generated_count = excluded.generated_count,
    queued_count = greatest(private.notification_processing_run.queued_count, excluded.queued_count),
    processing_status = case
      when excluded.processing_status = 'generated'
        then 'generated'
      when excluded.processing_status = 'partially_generated'
        and private.notification_processing_run.processing_status = 'generated'
        then 'generated'
      when excluded.processing_status = 'partially_generated'
        then 'partially_generated'
      when private.notification_processing_run.processing_status = 'generated'
        then private.notification_processing_run.processing_status
      else excluded.processing_status
    end,
    prepare_reason = excluded.prepare_reason,
    skip_reason_counts = excluded.skip_reason_counts,
    delivery_batch_id = coalesce(excluded.delivery_batch_id, private.notification_processing_run.delivery_batch_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.upsert_notification_processing_run(
  text, date, time, integer, integer, integer, integer, text, text, jsonb, uuid
) from public;

create or replace function public.worker_update_notification_processing_run(
  p_event_key text,
  p_operational_date date,
  p_scheduled_send_time time,
  p_queued_count integer,
  p_processing_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  update private.notification_processing_run r
  set
    last_checked_at = now(),
    queued_count = greatest(r.queued_count, coalesce(p_queued_count, 0)),
    processing_status = coalesce(
      p_processing_status,
      case
        when coalesce(p_queued_count, 0) > 0 and r.generated_count > coalesce(p_queued_count, 0)
          then 'partially_generated'
        when coalesce(p_queued_count, 0) > 0 then 'generated'
        else r.processing_status
      end
    )
  where r.event_key = p_event_key
    and r.operational_date = p_operational_date
    and r.scheduled_send_time = p_scheduled_send_time;
end;
$$;

revoke execute on function public.worker_update_notification_processing_run(text, date, time, integer, text)
  from public, anon, authenticated;
grant execute on function public.worker_update_notification_processing_run(text, date, time, integer, text)
  to service_role;

create or replace function public.worker_prepare_today_menu_batch(
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_send_time time;
  v_window_open boolean;
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
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_order_date := (p_as_of at time zone 'America/Jamaica')::date;

  if not private.notification_globally_enabled('staff.today_menu') then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'globally_disabled',
      'order_date', v_order_date
    );
  end if;

  select s.send_time
  into v_send_time
  from private.notification_settings s
  where s.event_key = 'staff.today_menu';

  if v_send_time is null then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'missing_send_time',
      'order_date', v_order_date
    );
  end if;

  select w.window_open
  into v_window_open
  from private.today_menu_send_window(v_order_date, v_send_time, p_as_of) w;

  if not coalesce(v_window_open, false) then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'outside_send_window',
      'order_date', v_order_date,
      'send_time', v_send_time::text,
      'window_open', false
    );
  end if;

  if not private.order_date_has_staff_menu(v_order_date) then
    v_processing_run_id := private.upsert_notification_processing_run(
      'staff.today_menu',
      v_order_date,
      v_send_time,
      0,
      0,
      0,
      0,
      'skipped',
      'no_menu',
      '{}'::jsonb,
      null
    );

    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'no_menu',
      'order_date', v_order_date,
      'send_time', v_send_time::text,
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
    from private.today_menu_recipient_eligible(v_profile.id, v_order_date, p_as_of) e;

    if not v_eligible then
      v_skip_reason_counts := private.notification_skip_reason_increment(
        v_skip_reason_counts,
        coalesce(v_reason, 'unknown')
      );
      continue;
    end if;

    v_eligible_count := v_eligible_count + 1;

    if v_batch_id is null then
      insert into private.notification_delivery_batch (event_key, operational_date)
      values ('staff.today_menu', v_order_date)
      on conflict (event_key, operational_date)
      do update set event_key = excluded.event_key
      returning id into v_batch_id;
    end if;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status
    )
    values (
      'staff.today_menu',
      v_profile.id,
      v_order_date,
      v_batch_id,
      'pending'
    )
    on conflict (event_key, profile_id, operational_date) do nothing
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
      'staff.today_menu',
      v_order_date,
      v_send_time,
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
      'send_time', v_send_time::text,
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
    'staff.today_menu',
    v_order_date,
    v_send_time,
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
    'send_time', v_send_time::text,
    'window_open', true,
    'candidates', v_candidates,
    'eligible_count', v_eligible_count,
    'inserted', v_inserted,
    'skip_reason_counts', v_skip_reason_counts,
    'processing_run_id', v_processing_run_id
  );
end;
$$;

create or replace function public.list_notification_processing_runs(
  p_from date,
  p_to date,
  p_limit integer default 15,
  p_offset integer default 0
)
returns table (
  run_id uuid,
  event_key text,
  event_name text,
  operational_date date,
  scheduled_send_time time,
  last_checked_at timestamptz,
  run_count integer,
  candidate_count integer,
  eligible_count integer,
  generated_count integer,
  queued_count integer,
  processing_status text,
  prepare_reason text,
  skip_reason_counts jsonb,
  delivery_batch_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_auth_settings()) then
    raise exception 'Notification delivery monitoring access required';
  end if;

  return query
  select
    r.id,
    r.event_key,
    c.display_name,
    r.operational_date,
    r.scheduled_send_time,
    r.last_checked_at,
    r.run_count,
    r.candidate_count,
    r.eligible_count,
    r.generated_count,
    r.queued_count,
    r.processing_status,
    r.prepare_reason,
    r.skip_reason_counts,
    r.delivery_batch_id
  from private.notification_processing_run r
  inner join private.notification_event_catalog c on c.event_key = r.event_key
  where r.operational_date between p_from and p_to
  order by r.last_checked_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.list_notification_processing_runs(date, date, integer, integer)
  from public, anon;
grant execute on function public.list_notification_processing_runs(date, date, integer, integer)
  to authenticated;

create or replace function public.get_notification_processing_run(p_run_id uuid)
returns table (
  run_id uuid,
  event_key text,
  event_name text,
  operational_date date,
  scheduled_send_time time,
  first_checked_at timestamptz,
  last_checked_at timestamptz,
  run_count integer,
  candidate_count integer,
  eligible_count integer,
  generated_count integer,
  queued_count integer,
  processing_status text,
  prepare_reason text,
  skip_reason_counts jsonb,
  delivery_batch_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_auth_settings()) then
    raise exception 'Notification delivery monitoring access required';
  end if;

  return query
  select
    r.id,
    r.event_key,
    c.display_name,
    r.operational_date,
    r.scheduled_send_time,
    r.first_checked_at,
    r.last_checked_at,
    r.run_count,
    r.candidate_count,
    r.eligible_count,
    r.generated_count,
    r.queued_count,
    r.processing_status,
    r.prepare_reason,
    r.skip_reason_counts,
    r.delivery_batch_id
  from private.notification_processing_run r
  inner join private.notification_event_catalog c on c.event_key = r.event_key
  where r.id = p_run_id;
end;
$$;

revoke execute on function public.get_notification_processing_run(uuid) from public, anon;
grant execute on function public.get_notification_processing_run(uuid) to authenticated;
