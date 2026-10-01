-- Lunch notification catalog, global settings, staff preferences, and email templates (foundation only).

create table private.notification_event_catalog (
  event_key text primary key,
  audience text not null,
  display_name text not null,
  description text not null,
  default_enabled boolean not null,
  user_configurable boolean not null default false,
  timing_configurable boolean not null default false,
  timing_mode text not null default 'immediate',
  allowed_variables text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_event_catalog_audience_check
    check (audience in ('staff', 'hr', 'accounts', 'provider')),
  constraint notification_event_catalog_timing_mode_check
    check (timing_mode in ('immediate', 'time_of_day', 'minutes_before_deadline'))
);

create trigger notification_event_catalog_set_updated_at
  before update on private.notification_event_catalog
  for each row
  execute function private.set_updated_at();

revoke all on private.notification_event_catalog from public, anon, authenticated;

create table private.notification_settings (
  event_key text primary key
    references private.notification_event_catalog (event_key) on delete restrict,
  enabled boolean not null,
  send_time time,
  minutes_before_deadline integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint notification_settings_minutes_positive
    check (minutes_before_deadline is null or minutes_before_deadline > 0)
);

create trigger notification_settings_set_updated_at
  before update on private.notification_settings
  for each row
  execute function private.set_updated_at();

revoke all on private.notification_settings from public, anon, authenticated;

create table private.notification_settings_audit (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  action text not null,
  old_record jsonb,
  new_record jsonb,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

revoke all on private.notification_settings_audit from public, anon, authenticated;

create table private.staff_notification_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_key text not null
    references private.notification_event_catalog (event_key) on delete restrict,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, event_key)
);

create trigger staff_notification_preferences_set_updated_at
  before update on private.staff_notification_preferences
  for each row
  execute function private.set_updated_at();

revoke all on private.staff_notification_preferences from public, anon, authenticated;

create table private.notification_email_templates (
  event_key text primary key
    references private.notification_event_catalog (event_key) on delete restrict,
  subject_template text not null,
  body_html_template text not null,
  body_text_template text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger notification_email_templates_set_updated_at
  before update on private.notification_email_templates
  for each row
  execute function private.set_updated_at();

revoke all on private.notification_email_templates from public, anon, authenticated;

-- Future delivery idempotency (not used until dispatch workers exist).
create table private.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  operational_date date,
  created_at timestamptz not null default now(),
  constraint notification_delivery_log_event_profile_date_key
    unique (event_key, profile_id, operational_date)
);

revoke all on private.notification_delivery_log from public, anon, authenticated;

insert into private.notification_event_catalog (
  event_key, audience, display_name, description,
  default_enabled, user_configurable, timing_configurable, timing_mode, allowed_variables
)
values
  (
    'staff.today_menu',
    'staff',
    'Today''s Menu',
    'Receive the day''s available lunch menu before ordering closes.',
    false, true, true, 'time_of_day',
    array['first_name', 'menu_date', 'provider_name', 'mains', 'sides', 'ordering_deadline', 'order_url']
  ),
  (
    'staff.order_submitted',
    'staff',
    'Order submitted',
    'Receive confirmation when you place an order.',
    true, true, false, 'immediate', array[]::text[]
  ),
  (
    'staff.order_changed',
    'staff',
    'Order changed',
    'Receive confirmation when your submitted order changes.',
    true, true, false, 'immediate', array[]::text[]
  ),
  (
    'staff.order_cancelled',
    'staff',
    'Order cancelled',
    'Receive confirmation if your order is cancelled.',
    true, true, false, 'immediate', array[]::text[]
  ),
  (
    'staff.deadline_reminder',
    'staff',
    'Ordering deadline reminder',
    'Receive a reminder before ordering closes.',
    false, true, true, 'minutes_before_deadline', array[]::text[]
  ),
  (
    'staff.changed_by_hr',
    'staff',
    'Lunch changed by HR',
    'Receive an email when HR makes a change that affects your lunch.',
    true, true, false, 'immediate', array[]::text[]
  ),
  (
    'hr.pending_signup_approval',
    'hr',
    'Pending signup approval',
    'Notify HR when a new staff account requires approval.',
    true, false, false, 'immediate', array[]::text[]
  ),
  (
    'hr.late_order_submitted',
    'hr',
    'Late order submitted',
    'Notify HR when a staff member submits a late order.',
    true, false, false, 'immediate', array[]::text[]
  ),
  (
    'hr.delivery_issue_reported',
    'hr',
    'Delivery issue reported',
    'Notify HR when a delivery issue is reported by staff or provider.',
    true, false, false, 'immediate', array[]::text[]
  ),
  (
    'hr.email_delivery_failure',
    'hr',
    'Provider/email delivery failure',
    'Notify HR when a provider email fails to send.',
    true, false, false, 'immediate', array[]::text[]
  ),
  (
    'accounts.period_ready',
    'accounts',
    'Lunch period ready for review',
    'Notify Accounts when a lunch period is ready for review.',
    true, false, false, 'immediate', array[]::text[]
  ),
  (
    'accounts.period_finalized',
    'accounts',
    'Lunch period finalized',
    'Notify Accounts when a lunch period is finalized.',
    true, false, false, 'immediate', array[]::text[]
  ),
  (
    'provider.daily_order_summary',
    'provider',
    'Daily order summary',
    'Send the daily order summary to providers.',
    true, false, true, 'time_of_day', array[]::text[]
  ),
  (
    'provider.late_order_supplement',
    'provider',
    'Late-order supplement',
    'Send supplemental order updates for late orders.',
    true, false, false, 'immediate', array[]::text[]
  );

insert into private.notification_settings (event_key, enabled, send_time, minutes_before_deadline)
select
  c.event_key,
  c.default_enabled,
  case
    when c.event_key = 'staff.today_menu' then time '08:00'
    when c.event_key = 'provider.daily_order_summary' then time '08:30'
    else null
  end,
  case
    when c.event_key = 'staff.deadline_reminder' then 30
    else null
  end
from private.notification_event_catalog c;

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template
)
values (
  'staff.today_menu',
  'Today''s Lunch Menu — {{menu_date}}',
  '<p>Hi {{first_name}},</p><p>Here''s today''s lunch menu from <strong>{{provider_name}}</strong> for {{menu_date}}.</p><p><strong>Main Dishes</strong></p>{{mains}}<p><strong>Sides / Options</strong></p>{{sides}}<p>Ordering closes at <strong>{{ordering_deadline}}</strong> (Jamaica time).</p><p><a href="{{order_url}}">Order Lunch</a></p><p>If you do not wish to order, no action is required.</p>',
  'Hi {{first_name}},

Here''s today''s lunch menu from {{provider_name}} for {{menu_date}}.

Main Dishes:
{{mains}}

Sides / Options:
{{sides}}

Ordering closes at {{ordering_deadline}} (Jamaica time).

Order Lunch: {{order_url}}

If you do not wish to order, no action is required.'
);

create or replace function private.audit_notification_settings_change(
  p_event_key text,
  p_action text,
  p_old jsonb,
  p_new jsonb,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.notification_settings_audit (
    event_key, action, old_record, new_record, changed_by
  )
  values (p_event_key, p_action, p_old, p_new, p_actor);
end;
$$;

revoke all on function private.audit_notification_settings_change(text, text, jsonb, jsonb, uuid) from public;

create or replace function private.notification_extract_template_variables(p_template text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct m[1] order by m[1]),
    array[]::text[]
  )
  from regexp_matches(coalesce(p_template, ''), '\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}', 'gi') as m;
$$;

revoke all on function private.notification_extract_template_variables(text) from public;

create or replace function private.assert_notification_template_variables(
  p_event_key text,
  p_subject_template text,
  p_body_html_template text,
  p_body_text_template text default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed text[];
  v_used text[];
  v_invalid text[];
begin
  select c.allowed_variables
  into v_allowed
  from private.notification_event_catalog c
  where c.event_key = p_event_key
    and c.active;

  if not found then
    raise exception 'Unknown notification event';
  end if;

  v_used := private.notification_extract_template_variables(
    coalesce(p_subject_template, '') || E'\n' || coalesce(p_body_html_template, '') || E'\n' || coalesce(p_body_text_template, '')
  );

  select coalesce(array_agg(v order by v), array[]::text[])
  into v_invalid
  from unnest(v_used) as v
  where not (v = any (v_allowed));

  if array_length(v_invalid, 1) is not null then
    raise exception 'Unsupported template variables: %', array_to_string(v_invalid, ', ');
  end if;
end;
$$;

revoke all on function private.assert_notification_template_variables(text, text, text, text) from public;

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
    coalesce(p.enabled, c.default_enabled) as personal_enabled,
    coalesce(s.enabled, c.default_enabled) as global_enabled,
    not coalesce(s.enabled, c.default_enabled) as globally_disabled
  from private.notification_event_catalog c
  left join private.staff_notification_preferences p
    on p.event_key = c.event_key
   and p.profile_id = v_profile
  left join private.notification_settings s on s.event_key = c.event_key
  where c.audience = 'staff'
    and c.user_configurable
    and c.active
  order by c.display_name asc;
end;
$$;

revoke all on function public.get_my_notification_preferences() from public;
grant execute on function public.get_my_notification_preferences() to authenticated;

create or replace function public.set_my_notification_preference(
  p_event_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := private.current_user_id();
begin
  if v_profile is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.notification_event_catalog c
    where c.event_key = p_event_key
      and c.audience = 'staff'
      and c.user_configurable
      and c.active
  ) then
    raise exception 'Notification preference is not configurable';
  end if;

  insert into private.staff_notification_preferences (profile_id, event_key, enabled)
  values (v_profile, p_event_key, coalesce(p_enabled, false))
  on conflict (profile_id, event_key)
  do update set enabled = excluded.enabled, updated_at = now();
end;
$$;

revoke all on function public.set_my_notification_preference(text, boolean) from public;
grant execute on function public.set_my_notification_preference(text, boolean) to authenticated;

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

  if p_audience not in ('staff', 'hr', 'accounts', 'provider') then
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

revoke all on function public.list_admin_notification_events(text) from public;
grant execute on function public.list_admin_notification_events(text) to authenticated;

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

revoke all on function public.update_notification_global_setting(text, boolean, time, integer) from public;
grant execute on function public.update_notification_global_setting(text, boolean, time, integer) to authenticated;

create or replace function public.list_notification_email_templates()
returns table (
  event_key text,
  display_name text,
  audience text,
  active boolean,
  updated_at timestamptz
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

  return query
  select
    t.event_key,
    c.display_name,
    c.audience,
    t.active,
    t.updated_at
  from private.notification_email_templates t
  inner join private.notification_event_catalog c on c.event_key = t.event_key
  order by c.audience, c.display_name;
end;
$$;

revoke all on function public.list_notification_email_templates() from public;
grant execute on function public.list_notification_email_templates() to authenticated;

create or replace function public.get_notification_email_template(p_event_key text)
returns table (
  event_key text,
  display_name text,
  audience text,
  subject_template text,
  body_html_template text,
  body_text_template text,
  allowed_variables text[],
  active boolean,
  updated_at timestamptz
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

  return query
  select
    t.event_key,
    c.display_name,
    c.audience,
    t.subject_template,
    t.body_html_template,
    t.body_text_template,
    c.allowed_variables,
    t.active,
    t.updated_at
  from private.notification_email_templates t
  inner join private.notification_event_catalog c on c.event_key = t.event_key
  where t.event_key = p_event_key;
end;
$$;

revoke all on function public.get_notification_email_template(text) from public;
grant execute on function public.get_notification_email_template(text) to authenticated;

create or replace function public.upsert_notification_email_template(
  p_event_key text,
  p_subject_template text,
  p_body_html_template text,
  p_body_text_template text default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_auth_settings()) then
    raise exception 'Notification settings management access required';
  end if;

  perform private.assert_notification_template_variables(
    p_event_key,
    p_subject_template,
    p_body_html_template,
    p_body_text_template
  );

  insert into private.notification_email_templates (
    event_key,
    subject_template,
    body_html_template,
    body_text_template,
    active,
    updated_by
  )
  values (
    p_event_key,
    btrim(p_subject_template),
    p_body_html_template,
    nullif(btrim(p_body_text_template), ''),
    coalesce(p_active, true),
    v_actor
  )
  on conflict (event_key)
  do update set
    subject_template = excluded.subject_template,
    body_html_template = excluded.body_html_template,
    body_text_template = excluded.body_text_template,
    active = excluded.active,
    updated_by = v_actor;
end;
$$;

revoke all on function public.upsert_notification_email_template(text, text, text, text, boolean) from public;
grant execute on function public.upsert_notification_email_template(text, text, text, text, boolean) to authenticated;
