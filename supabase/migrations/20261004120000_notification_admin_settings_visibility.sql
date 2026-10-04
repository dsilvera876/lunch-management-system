-- Hide dormant catalog events from Admin Email Settings; toggles only when they affect delivery.

alter table private.notification_event_catalog
  add column if not exists admin_global_setting_effective boolean not null default true;

comment on column private.notification_event_catalog.admin_global_setting_effective is
  'When false, the event is omitted from Admin Email Settings and global toggle updates are rejected.';

update private.notification_event_catalog
set admin_global_setting_effective = false
where event_key in (
  'accounts.period_ready',
  'accounts.period_finalized',
  'provider.late_order_supplement'
);

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
    and c.admin_global_setting_effective
  order by c.display_name asc;
end;
$$;

create or replace function public.update_notification_global_setting(
  p_event_key text,
  p_enabled boolean,
  p_send_time time default null,
  p_minutes_before_deadline integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_old jsonb;
  v_new jsonb;
  v_catalog private.notification_event_catalog%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_auth_settings()) then
    raise exception 'Notification settings management access required';
  end if;

  select *
  into v_catalog
  from private.notification_event_catalog c
  where c.event_key = p_event_key
    and c.active;

  if not found then
    raise exception 'Unknown notification event';
  end if;

  if not v_catalog.admin_global_setting_effective then
    raise exception 'Notification global setting is not manageable in Email Settings';
  end if;

  if p_send_time is not null then
    if not v_catalog.timing_configurable or v_catalog.timing_mode <> 'time_of_day' then
      raise exception 'Send time is not configurable for this notification';
    end if;
  end if;

  if p_minutes_before_deadline is not null then
    if not v_catalog.timing_configurable or v_catalog.timing_mode <> 'minutes_before_deadline' then
      raise exception 'Reminder offset is not configurable for this notification';
    end if;

    if p_minutes_before_deadline < 5 or p_minutes_before_deadline > 240 then
      raise exception 'Minutes before deadline must be between 5 and 240';
    end if;
  end if;

  select to_jsonb(s.*)
  into v_old
  from private.notification_settings s
  where s.event_key = p_event_key;

  update private.notification_settings s
  set
    enabled = coalesce(p_enabled, s.enabled),
    send_time = case
      when v_catalog.timing_configurable and v_catalog.timing_mode = 'time_of_day'
        then coalesce(p_send_time, s.send_time)
      else s.send_time
    end,
    minutes_before_deadline = case
      when v_catalog.timing_configurable and v_catalog.timing_mode = 'minutes_before_deadline'
        then coalesce(p_minutes_before_deadline, s.minutes_before_deadline)
      else s.minutes_before_deadline
    end,
    updated_by = v_actor
  where s.event_key = p_event_key;

  select to_jsonb(s.*)
  into v_new
  from private.notification_settings s
  where s.event_key = p_event_key;

  perform private.audit_notification_settings_change(
    p_event_key,
    'update_global',
    v_old,
    v_new,
    v_actor
  );
end;
$$;
