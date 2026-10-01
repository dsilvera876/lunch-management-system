-- Email Delivery: avoid orphan zero-recipient batches, improve batch status and monitoring filters.

delete from private.notification_delivery_batch b
where not exists (
  select 1
  from private.notification_delivery_log d
  where d.batch_id = b.id
);

create or replace function private.notification_skip_reason_increment(
  p_counts jsonb,
  p_reason text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_set(
    coalesce(p_counts, '{}'::jsonb),
    array[p_reason],
    to_jsonb(coalesce((p_counts ->> p_reason)::integer, 0) + 1),
    true
  );
$$;

revoke all on function private.notification_skip_reason_increment(jsonb, text) from public;

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
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'no_menu',
      'order_date', v_order_date,
      'send_time', v_send_time::text,
      'window_open', true
    );
  end if;

  select count(*)::integer
  into v_candidates
  from public.profiles p
  where p.role = 'staff'
    and p.account_status = 'active';

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
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'no_eligible_recipients',
      'order_date', v_order_date,
      'send_time', v_send_time::text,
      'window_open', true,
      'candidates', v_candidates,
      'eligible_count', v_eligible_count,
      'inserted', 0,
      'skip_reason_counts', v_skip_reason_counts
    );
  end if;

  return jsonb_build_object(
    'action', 'prepared',
    'batch_id', v_batch_id,
    'order_date', v_order_date,
    'send_time', v_send_time::text,
    'window_open', true,
    'candidates', v_candidates,
    'eligible_count', v_eligible_count,
    'inserted', v_inserted,
    'skip_reason_counts', v_skip_reason_counts
  );
end;
$$;

create or replace function private.notification_delivery_batch_status(p_batch_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) = 0 then 'no_recipients'
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
    coalesce(a.batch_status, 'no_recipients')
  from batches ba
  inner join agg a on a.batch_id = ba.id
  where coalesce(a.recipient_count, 0) > 0
    and (p_status is null or coalesce(a.batch_status, 'no_recipients') = p_status)
  order by ba.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
