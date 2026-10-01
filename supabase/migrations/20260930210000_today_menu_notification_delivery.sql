-- Today''s Menu notification delivery: batches, delivery records, worker RPCs, admin monitoring.

create table private.notification_delivery_batch (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  operational_date date not null,
  created_at timestamptz not null default now(),
  constraint notification_delivery_batch_event_date_key unique (event_key, operational_date)
);

create index notification_delivery_batch_created_at_idx
  on private.notification_delivery_batch (created_at desc);

revoke all on private.notification_delivery_batch from public, anon, authenticated;

alter table private.notification_delivery_log
  add column if not exists batch_id uuid references private.notification_delivery_batch (id) on delete set null,
  add column if not exists status text not null default 'pending',
  add column if not exists recipient_email text,
  add column if not exists recipient_name text,
  add column if not exists email_queue_id uuid references private.email_delivery_queue (id) on delete set null,
  add column if not exists rendered_subject text,
  add column if not exists rendered_text_body text,
  add column if not exists rendered_html_body text,
  add column if not exists transport_attempts integer not null default 0,
  add column if not exists sent_at timestamptz,
  add column if not exists last_error text,
  add column if not exists skip_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table private.notification_delivery_log
  drop constraint if exists notification_delivery_log_status_check;

alter table private.notification_delivery_log
  add constraint notification_delivery_log_status_check
  check (status in ('pending', 'queued', 'sent', 'failed', 'skipped'));

create index notification_delivery_log_batch_id_idx
  on private.notification_delivery_log (batch_id);

create index notification_delivery_log_status_idx
  on private.notification_delivery_log (status, created_at desc);

create trigger notification_delivery_log_set_updated_at
  before update on private.notification_delivery_log
  for each row
  execute function private.set_updated_at();

create or replace function private.today_menu_grace_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 15;
$$;

revoke all on function private.today_menu_grace_minutes() from public;

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
        and c.active
    ),
    false
  );
$$;

revoke all on function private.notification_staff_preference_enabled(uuid, text) from public;

create or replace function private.notification_globally_enabled(p_event_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.enabled
      from private.notification_settings s
      where s.event_key = p_event_key
    ),
    (
      select c.default_enabled
      from private.notification_event_catalog c
      where c.event_key = p_event_key
        and c.active
    ),
    false
  );
$$;

revoke all on function private.notification_globally_enabled(text) from public;

create or replace function private.today_menu_send_window(
  p_order_date date,
  p_send_time time,
  p_as_of timestamptz default now()
)
returns table (
  window_open boolean,
  window_start timestamptz,
  window_end timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_window_start timestamp;
  v_window_end timestamp;
begin
  v_local := p_as_of at time zone 'America/Jamaica';

  if v_local::date is distinct from p_order_date then
    return query
    select false, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_window_start := p_order_date + p_send_time;
  v_window_end := v_window_start + make_interval(mins => private.today_menu_grace_minutes());

  return query
  select
    v_local >= v_window_start and v_local < v_window_end,
    v_window_start at time zone 'America/Jamaica',
    v_window_end at time zone 'America/Jamaica';
end;
$$;

revoke all on function private.today_menu_send_window(date, time, timestamptz) from public;

create or replace function private.order_date_has_staff_menu(p_order_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_weekday integer;
  v_provider record;
  v_snapshot_count integer;
  v_catalog_count integer;
begin
  v_weekday := public.iso_weekday(p_order_date);

  if v_weekday is null then
    return false;
  end if;

  for v_provider in
    select lp.id
    from public.lunch_providers lp
    where lp.active
  loop
    select count(*)::integer
    into v_snapshot_count
    from public.lunch_days ld
    inner join public.menu_items mi on mi.lunch_day_id = ld.id
    where ld.order_date = p_order_date
      and ld.provider_id = v_provider.id
      and mi.is_active;

    if v_snapshot_count > 0 then
      return true;
    end if;

    select count(*)::integer
    into v_catalog_count
    from public.provider_menu_items pmi
    inner join public.provider_menu_item_weekdays pmw on pmw.provider_menu_item_id = pmi.id
    where pmi.provider_id = v_provider.id
      and pmi.active
      and pmw.weekday = v_weekday;

    if v_catalog_count > 0 then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function private.order_date_has_staff_menu(date) from public;

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

  if not private.notification_staff_preference_enabled(p_profile_id, 'staff.today_menu') then
    return query select false, 'preference_disabled';
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

  if v_profile.role <> 'staff' or v_profile.account_status <> 'active' then
    return query select false, 'not_active_staff';
    return;
  end if;

  select u.email
  into v_email
  from auth.users u
  where u.id = p_profile_id;

  if v_email is null or btrim(v_email) = '' or position('@' in v_email) = 0 then
    return query select false, 'missing_email';
    return;
  end if;

  v_location_id := v_profile.default_office_location_id;

  if not public.is_business_day(p_order_date, v_location_id) then
    return query select false, 'closed_business_day';
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
    return query select false, 'no_menu';
    return;
  end if;

  return query select true, null::text;
end;
$$;

revoke all on function private.today_menu_recipient_eligible(uuid, date, timestamptz) from public;

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
  v_profile record;
  v_eligible boolean;
  v_reason text;
  v_new_delivery_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_order_date := (p_as_of at time zone 'America/Jamaica')::date;

  if not private.notification_globally_enabled('staff.today_menu') then
    return jsonb_build_object('action', 'skipped', 'reason', 'globally_disabled');
  end if;

  select s.send_time
  into v_send_time
  from private.notification_settings s
  where s.event_key = 'staff.today_menu';

  if v_send_time is null then
    return jsonb_build_object('action', 'skipped', 'reason', 'missing_send_time');
  end if;

  select w.window_open
  into v_window_open
  from private.today_menu_send_window(v_order_date, v_send_time, p_as_of) w;

  if not coalesce(v_window_open, false) then
    return jsonb_build_object('action', 'skipped', 'reason', 'outside_send_window', 'order_date', v_order_date);
  end if;

  if not private.order_date_has_staff_menu(v_order_date) then
    return jsonb_build_object('action', 'skipped', 'reason', 'no_menu', 'order_date', v_order_date);
  end if;

  insert into private.notification_delivery_batch (event_key, operational_date)
  values ('staff.today_menu', v_order_date)
  on conflict (event_key, operational_date)
  do update set event_key = excluded.event_key
  returning id into v_batch_id;

  for v_profile in
    select p.id
    from public.profiles p
    where p.role = 'staff'
      and p.account_status = 'active'
  loop
    select e.eligible, e.reason
    into v_eligible, v_reason
    from private.today_menu_recipient_eligible(v_profile.id, v_order_date, p_as_of) e;

    if not v_eligible then
      continue;
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
    end if;
  end loop;

  return jsonb_build_object(
    'action', 'prepared',
    'batch_id', v_batch_id,
    'order_date', v_order_date,
    'inserted', v_inserted
  );
end;
$$;

revoke execute on function public.worker_prepare_today_menu_batch(timestamptz) from public, anon, authenticated;
grant execute on function public.worker_prepare_today_menu_batch(timestamptz) to service_role;

create or replace function public.worker_list_pending_today_menu_deliveries(
  p_limit integer default 50
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
  where d.event_key = 'staff.today_menu'
    and d.status = 'pending'
    and d.email_queue_id is null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_today_menu_deliveries(integer) from public, anon, authenticated;
grant execute on function public.worker_list_pending_today_menu_deliveries(integer) to service_role;

create or replace function public.worker_queue_today_menu_delivery(
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

  if v_delivery.event_key <> 'staff.today_menu' then
    raise exception 'Unsupported notification delivery event';
  end if;

  if v_delivery.status not in ('pending', 'queued') then
    raise exception 'Notification delivery is not queueable';
  end if;

  if v_delivery.email_queue_id is not null then
    return v_delivery.email_queue_id;
  end if;

  v_queue_id := public.service_enqueue_email_delivery(
    'notification_today_menu',
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

revoke execute on function public.worker_queue_today_menu_delivery(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.worker_queue_today_menu_delivery(uuid, text, text, text, text) to service_role;

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

revoke all on function private.sync_notification_delivery_from_queue(uuid) from public;

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

revoke execute on function public.worker_complete_email_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.worker_complete_email_delivery(uuid, text, text) to service_role;

create or replace function private.notification_delivery_batch_status(p_batch_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) filter (where d.status in ('pending', 'queued')) > 0 then 'pending'
    when count(*) filter (where d.status = 'failed') > 0
      and count(*) filter (where d.status = 'sent') = 0 then 'failed'
    when count(*) filter (where d.status = 'failed') > 0 then 'partial'
    when count(*) filter (where d.status = 'sent') > 0 then 'sent'
    else 'pending'
  end
  from private.notification_delivery_log d
  where d.batch_id = p_batch_id;
$$;

revoke all on function private.notification_delivery_batch_status(uuid) from public;

create or replace function public.get_notification_delivery_dashboard(
  p_from date,
  p_to date
)
returns table (
  total_count bigint,
  sent_count bigint,
  failed_count bigint,
  pending_count bigint
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
    count(*)::bigint,
    count(*) filter (where d.status = 'sent')::bigint,
    count(*) filter (where d.status = 'failed')::bigint,
    count(*) filter (where d.status in ('pending', 'queued'))::bigint
  from private.notification_delivery_log d
  where d.created_at::date between p_from and p_to;
end;
$$;

revoke execute on function public.get_notification_delivery_dashboard(date, date) from public, anon;
grant execute on function public.get_notification_delivery_dashboard(date, date) to authenticated;

create or replace function public.list_notification_delivery_batches(
  p_from date,
  p_to date,
  p_event_key text default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  batch_id uuid,
  event_key text,
  event_name text,
  operational_date date,
  created_at timestamptz,
  recipient_count bigint,
  sent_count bigint,
  failed_count bigint,
  pending_count bigint,
  batch_status text
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
  with batches as (
    select
      b.id,
      b.event_key,
      c.display_name,
      b.operational_date,
      b.created_at
    from private.notification_delivery_batch b
    inner join private.notification_event_catalog c on c.event_key = b.event_key
    where b.created_at::date between p_from and p_to
      and (p_event_key is null or b.event_key = p_event_key)
  ),
  agg as (
    select
      ba.id as batch_id,
      count(d.id)::bigint as recipient_count,
      count(d.id) filter (where d.status = 'sent')::bigint as sent_count,
      count(d.id) filter (where d.status = 'failed')::bigint as failed_count,
      count(d.id) filter (where d.status in ('pending', 'queued'))::bigint as pending_count,
      private.notification_delivery_batch_status(ba.id) as batch_status
    from batches ba
    left join private.notification_delivery_log d on d.batch_id = ba.id
    group by ba.id
  )
  select
    ba.id,
    ba.event_key,
    ba.display_name,
    ba.operational_date,
    ba.created_at,
    coalesce(a.recipient_count, 0),
    coalesce(a.sent_count, 0),
    coalesce(a.failed_count, 0),
    coalesce(a.pending_count, 0),
    coalesce(a.batch_status, 'pending')
  from batches ba
  left join agg a on a.batch_id = ba.id
  where p_status is null or coalesce(a.batch_status, 'pending') = p_status
  order by ba.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.list_notification_delivery_batches(date, date, text, text, integer, integer)
  from public, anon;
grant execute on function public.list_notification_delivery_batches(date, date, text, text, integer, integer)
  to authenticated;

create or replace function public.get_notification_delivery_batch_detail(p_batch_id uuid)
returns table (
  batch_id uuid,
  event_key text,
  event_name text,
  operational_date date,
  created_at timestamptz,
  batch_status text,
  recipient_count bigint,
  sent_count bigint,
  failed_count bigint,
  pending_count bigint
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
    b.id,
    b.event_key,
    c.display_name,
    b.operational_date,
    b.created_at,
    private.notification_delivery_batch_status(b.id),
    count(d.id)::bigint,
    count(d.id) filter (where d.status = 'sent')::bigint,
    count(d.id) filter (where d.status = 'failed')::bigint,
    count(d.id) filter (where d.status in ('pending', 'queued'))::bigint
  from private.notification_delivery_batch b
  inner join private.notification_event_catalog c on c.event_key = b.event_key
  left join private.notification_delivery_log d on d.batch_id = b.id
  where b.id = p_batch_id
  group by b.id, b.event_key, c.display_name, b.operational_date, b.created_at;
end;
$$;

revoke execute on function public.get_notification_delivery_batch_detail(uuid) from public, anon;
grant execute on function public.get_notification_delivery_batch_detail(uuid) to authenticated;

create or replace function public.list_notification_delivery_recipients(p_batch_id uuid)
returns table (
  delivery_id uuid,
  recipient_name text,
  recipient_email text,
  status text,
  sent_at timestamptz,
  transport_attempts integer,
  last_error text
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
    d.id,
    coalesce(d.recipient_name, split_part(d.recipient_email, '@', 1)),
    d.recipient_email,
    d.status,
    d.sent_at,
    d.transport_attempts,
    d.last_error
  from private.notification_delivery_log d
  where d.batch_id = p_batch_id
  order by coalesce(d.recipient_name, d.recipient_email) asc;
end;
$$;

revoke execute on function public.list_notification_delivery_recipients(uuid) from public, anon;
grant execute on function public.list_notification_delivery_recipients(uuid) to authenticated;

create or replace function public.get_notification_delivery_content_sample(p_batch_id uuid)
returns table (
  delivery_id uuid,
  rendered_subject text,
  rendered_text_body text,
  rendered_html_body text
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
    d.id,
    d.rendered_subject,
    d.rendered_text_body,
    d.rendered_html_body
  from private.notification_delivery_log d
  where d.batch_id = p_batch_id
    and d.rendered_subject is not null
  order by d.created_at asc
  limit 1;
end;
$$;

revoke execute on function public.get_notification_delivery_content_sample(uuid) from public, anon;
grant execute on function public.get_notification_delivery_content_sample(uuid) to authenticated;

create or replace function public.worker_get_notification_email_template(p_event_key text)
returns table (
  subject_template text,
  body_html_template text,
  body_text_template text
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
    t.subject_template,
    t.body_html_template,
    t.body_text_template
  from private.notification_email_templates t
  where t.event_key = p_event_key
    and t.active;
end;
$$;

revoke execute on function public.worker_get_notification_email_template(text) from public, anon, authenticated;
grant execute on function public.worker_get_notification_email_template(text) to service_role;
