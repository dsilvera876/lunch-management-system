-- Restore Today''s Menu worker prepare (processing audit, lazy batch) with idempotency_key.

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
  v_idempotency_key text;
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
      begin
        insert into private.notification_delivery_batch (event_key, operational_date)
        values ('staff.today_menu', v_order_date)
        returning id into v_batch_id;
      exception
        when unique_violation then
          select b.id
          into v_batch_id
          from private.notification_delivery_batch b
          where b.event_key = 'staff.today_menu'
            and b.operational_date = v_order_date;
      end;
    end if;

    v_idempotency_key :=
      'staff.today_menu:' || v_profile.id::text || ':' || v_order_date::text;

    insert into private.notification_delivery_log (
      event_key,
      profile_id,
      operational_date,
      batch_id,
      status,
      idempotency_key
    )
    values (
      'staff.today_menu',
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
