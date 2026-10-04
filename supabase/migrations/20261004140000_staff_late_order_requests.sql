-- Staff Late Order Requests (not orders until HR fulfillment).

create table private.staff_late_order_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles (id) on delete restrict,
  provider_id uuid not null references public.lunch_providers (id) on delete restrict,
  office_location_id uuid not null references public.office_locations (id) on delete restrict,
  order_date date not null,
  scheduled_delivery_date date not null,
  status text not null,
  requested_summary text not null,
  quantity integer not null default 1,
  special_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  fulfilled_at timestamptz,
  declined_at timestamptz,
  expired_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  decline_reason text,
  fulfilled_order_id uuid references public.orders (id) on delete set null,
  constraint staff_late_order_requests_status_check
    check (status in ('pending', 'fulfilled', 'declined', 'cancelled', 'expired')),
  constraint staff_late_order_requests_summary_check
    check (char_length(btrim(requested_summary)) between 1 and 500),
  constraint staff_late_order_requests_quantity_check
    check (quantity between 1 and 10),
  constraint staff_late_order_requests_special_instructions_check
    check (special_instructions is null or char_length(special_instructions) <= 500),
  constraint staff_late_order_requests_decline_reason_check
    check (decline_reason is null or char_length(btrim(decline_reason)) between 1 and 500)
);

create unique index staff_late_order_requests_one_pending_idx
  on private.staff_late_order_requests (requester_profile_id, provider_id, scheduled_delivery_date)
  where status = 'pending';

create index staff_late_order_requests_requester_idx
  on private.staff_late_order_requests (requester_profile_id, created_at desc);

create index staff_late_order_requests_pending_idx
  on private.staff_late_order_requests (status, scheduled_delivery_date)
  where status = 'pending';

create trigger staff_late_order_requests_set_updated_at
  before update on private.staff_late_order_requests
  for each row
  execute function private.set_updated_at();

revoke all on private.staff_late_order_requests from public, anon, authenticated;

create table private.staff_late_order_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references private.staff_late_order_requests (id) on delete cascade,
  event_type text not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_late_order_request_events_type_check
    check (event_type in ('submitted', 'updated', 'cancelled', 'fulfilled', 'declined', 'expired'))
);

create index staff_late_order_request_events_request_idx
  on private.staff_late_order_request_events (request_id, created_at);

revoke all on private.staff_late_order_request_events from public, anon, authenticated;

alter table private.notification_delivery_log
  add column if not exists staff_late_order_request_id uuid
    references private.staff_late_order_requests (id) on delete set null;

create index if not exists notification_delivery_log_staff_late_order_request_id_idx
  on private.notification_delivery_log (staff_late_order_request_id)
  where staff_late_order_request_id is not null;

-- Catalog: HR submitted + staff status events
insert into private.notification_event_catalog (
  event_key, audience, display_name, description,
  default_enabled, user_configurable, timing_configurable, timing_mode, allowed_variables,
  admin_global_setting_effective
)
values
  (
    'staff.late_order_request_fulfilled',
    'staff',
    'Late order request fulfilled',
    'Notify staff when HR fulfills their late order request.',
    true, false, false, 'immediate',
    array['first_name', 'provider_name', 'delivery_date', 'requested_summary'],
    true
  ),
  (
    'staff.late_order_request_declined',
    'staff',
    'Late order request declined',
    'Notify staff when HR declines their late order request.',
    true, false, false, 'immediate',
    array['first_name', 'provider_name', 'delivery_date', 'decline_reason'],
    true
  ),
  (
    'staff.late_order_request_expired',
    'staff',
    'Late order request expired',
    'Notify staff when their late order request expired before fulfillment.',
    true, false, false, 'immediate',
    array['first_name', 'provider_name', 'delivery_date'],
    true
  )
on conflict (event_key) do nothing;

update private.notification_event_catalog
set
  display_name = 'Late order request submitted',
  description = 'Notify HR when a staff member submits a late order request.',
  allowed_variables = array[
    'employee_name', 'provider_name', 'delivery_date', 'requested_summary', 'submitted_at', 'review_url'
  ],
  admin_global_setting_effective = true
where event_key = 'hr.late_order_submitted';

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template, active
)
values
  (
    'hr.late_order_submitted',
    'Late order request submitted',
    '<p><strong>{{employee_name}}</strong> submitted a late order request.</p><p><strong>Provider:</strong> {{provider_name}}<br><strong>Delivery:</strong> {{delivery_date}}<br><strong>Request:</strong> {{requested_summary}}<br><strong>Submitted:</strong> {{submitted_at}}</p><p><a href="{{review_url}}">Review in Late Orders</a></p>',
    'Late order request submitted

Employee: {{employee_name}}
Provider: {{provider_name}}
Delivery: {{delivery_date}}
Request: {{requested_summary}}
Submitted: {{submitted_at}}

Review: {{review_url}}',
    true
  ),
  (
    'staff.late_order_request_fulfilled',
    'Your late order request was fulfilled',
    '<p>Hi {{first_name}},</p><p>Your late order request for <strong>{{provider_name}}</strong> on {{delivery_date}} was fulfilled.</p><p>You requested: {{requested_summary}}</p>',
    'Hi {{first_name}},

Your late order request for {{provider_name}} on {{delivery_date}} was fulfilled.

You requested: {{requested_summary}}',
    true
  ),
  (
    'staff.late_order_request_declined',
    'Your late order request was declined',
    '<p>Hi {{first_name}},</p><p>Your late order request for <strong>{{provider_name}}</strong> on {{delivery_date}} was declined.</p><p><strong>Reason:</strong> {{decline_reason}}</p>',
    'Hi {{first_name}},

Your late order request for {{provider_name}} on {{delivery_date}} was declined.

Reason: {{decline_reason}}',
    true
  ),
  (
    'staff.late_order_request_expired',
    'Your late order request expired',
    '<p>Hi {{first_name}},</p><p>Your late order request for <strong>{{provider_name}}</strong> on {{delivery_date}} expired because the provider late-order deadline passed before HR could fulfill it.</p>',
    'Hi {{first_name}},

Your late order request for {{provider_name}} on {{delivery_date}} expired because the provider late-order deadline passed before HR could fulfill it.',
    true
  )
on conflict (event_key) do update
set
  subject_template = excluded.subject_template,
  body_html_template = excluded.body_html_template,
  body_text_template = excluded.body_text_template,
  active = excluded.active;

insert into private.notification_settings (event_key, enabled, send_time, minutes_before_deadline)
select c.event_key, c.default_enabled, null, null
from private.notification_event_catalog c
where c.event_key in (
  'staff.late_order_request_fulfilled',
  'staff.late_order_request_declined',
  'staff.late_order_request_expired'
)
on conflict (event_key) do nothing;

create or replace function private.insert_staff_late_order_request_event(
  p_request_id uuid,
  p_event_type text,
  p_actor_profile_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.staff_late_order_request_events (
    request_id, event_type, actor_profile_id, event_payload
  )
  values (p_request_id, p_event_type, p_actor_profile_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function private.insert_staff_late_order_request_event(uuid, text, uuid, jsonb) from public;

create or replace function private.profile_has_submitted_late_order(
  p_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date
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
      and ld.provider_id = p_provider_id
      and ld.lunch_date = p_scheduled_delivery_date
      and o.is_late_order = true
      and o.status = 'submitted'
  );
$$;

revoke all on function private.profile_has_submitted_late_order(uuid, uuid, date) from public;

create or replace function private.profile_has_pending_staff_late_order_request(
  p_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.staff_late_order_requests r
    where r.requester_profile_id = p_profile_id
      and r.provider_id = p_provider_id
      and r.scheduled_delivery_date = p_scheduled_delivery_date
      and r.status = 'pending'
  );
$$;

revoke all on function private.profile_has_pending_staff_late_order_request(uuid, uuid, date) from public;

create or replace function private.assert_no_pending_staff_late_order_request_for_direct_hr_create(
  p_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.profile_has_pending_staff_late_order_request(
    p_profile_id,
    p_provider_id,
    p_scheduled_delivery_date
  ) then
    raise exception
      'This employee has a pending late-order request for this provider and date. Review and fulfill that request instead.';
  end if;
end;
$$;

revoke all on function private.assert_no_pending_staff_late_order_request_for_direct_hr_create(uuid, uuid, date) from public;

create or replace function private.suppress_unsent_hr_late_order_submitted_deliveries(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null then
    return;
  end if;

  update private.email_delivery_queue q
  set
    status = 'failed',
    last_error = 'Superseded: staff late-order request is no longer pending.'
  from private.notification_delivery_log d
  where d.staff_late_order_request_id = p_request_id
    and d.event_key = 'hr.late_order_submitted'
    and d.email_queue_id = q.id
    and d.status in ('pending', 'queued')
    and q.status in ('pending', 'processing');

  update private.notification_delivery_log d
  set
    status = 'skipped',
    updated_at = now()
  where d.event_key = 'hr.late_order_submitted'
    and d.staff_late_order_request_id = p_request_id
    and d.status in ('pending', 'queued')
    and (
      d.email_queue_id is null
      or not exists (
        select 1
        from private.email_delivery_queue q
        where q.id = d.email_queue_id
          and q.status = 'sent'
      )
    );
end;
$$;

revoke all on function private.suppress_unsent_hr_late_order_submitted_deliveries(uuid) from public;

create or replace function private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);
exception when others then
  raise warning 'safe_suppress_unsent_hr_late_order_submitted_deliveries failed for %: %', p_request_id, sqlerrm;
end;
$$;

revoke all on function private.safe_suppress_unsent_hr_late_order_submitted_deliveries(uuid) from public;

create or replace function private.assert_staff_late_order_request_window(
  p_requester_profile_id uuid,
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_as_of timestamptz default now()
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_location_id uuid;
  v_accepts boolean;
  v_provider_deadline timestamptz;
begin
  if not private.is_active_lunch_ordering_profile(p_requester_profile_id) then
    raise exception 'Lunch ordering is not available for this account';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_requester_profile_id
      and p.account_status = 'active'
  ) then
    raise exception 'Account is not active';
  end if;

  select p.default_office_location_id
  into v_location_id
  from public.profiles p
  where p.id = p_requester_profile_id;

  if v_location_id is null then
    raise exception 'Default office location is required';
  end if;

  select lp.accepts_late_orders
  into v_accepts
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not coalesce(v_accepts, false) then
    raise exception 'Provider does not accept late orders';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date, v_location_id);

  if v_order_date is null then
    raise exception 'Invalid delivery date';
  end if;

  if public.delivery_date_for_order_date(v_order_date, v_location_id) <> p_scheduled_delivery_date then
    raise exception 'Delivery date does not match order cycle';
  end if;

  perform private.validate_order_date_not_in_finalized_period(v_order_date);

  if not public.is_business_day(v_order_date, v_location_id) then
    raise exception 'Ordering is not available on this business day';
  end if;

  if public.is_before_order_deadline(v_order_date, p_as_of) then
    raise exception 'Normal ordering is still open; use standard ordering';
  end if;

  v_provider_deadline := public.provider_late_order_deadline_at(
    p_provider_id,
    v_order_date,
    p_scheduled_delivery_date
  );

  if v_provider_deadline is null then
    raise exception 'Provider late-order deadline is not configured';
  end if;

  if p_as_of > v_provider_deadline then
    raise exception 'Provider late-order deadline has passed';
  end if;
end;
$$;

revoke all on function private.assert_staff_late_order_request_window(uuid, uuid, date, timestamptz) from public;

-- Shared HR late-order creation (authorized callers only).
create or replace function private.create_hr_late_order_core(
  p_actor uuid,
  p_profile_id uuid,
  p_provider_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_lunch_day_id uuid;
  v_jamaica_today date := private.jamaica_today_date();
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_order_id uuid;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_employee_location_id uuid;
  v_special_instructions text;
begin
  if not exists (
    select 1 from public.profiles pr where pr.id = p_profile_id
  ) then
    raise exception 'Employee not found';
  end if;

  select p.default_office_location_id
  into v_employee_location_id
  from public.profiles p
  where p.id = p_profile_id;

  perform private.assert_staff_late_order_request_window(
    p_profile_id,
    p_provider_id,
    p_delivery_date,
    now()
  );

  v_order_date := public.order_date_for_delivery_date(p_delivery_date, v_employee_location_id);

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(p_provider_id, v_order_date);

  if v_lunch_day_id is null then
    if v_order_date < v_jamaica_today then
      raise exception 'The menu snapshot for this provider and order date is unavailable.';
    elsif v_order_date = v_jamaica_today then
      v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
    else
      raise exception 'The menu snapshot for this provider and order date is unavailable.';
    end if;
  elsif v_order_date = v_jamaica_today then
    v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(v_lunch_day_id, p_items);
  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_hr_order_office_location_snapshot(p_office_location_id);

  v_special_instructions := private.normalize_special_instructions(p_special_instructions);

  if length(trim(coalesce(p_special_instructions, ''))) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.activate_bypass_order_deadline();

  insert into public.orders (
    profile_id, lunch_day_id, meal_quantity,
    office_location_id, office_location_name, office_location_address,
    special_instructions, is_late_order,
    late_order_created_by, late_order_approved_at, late_order_approved_by
  )
  values (
    p_profile_id, v_lunch_day_id, v_meal_quantity,
    v_location_id, v_location_name, v_location_address,
    v_special_instructions, true,
    p_actor, now(), p_actor
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity)
    values (v_order_id, v_menu_item_id, v_lunch_day_id, v_quantity);
  end loop;

  perform private.safe_notify_staff_order_event('staff.changed_by_hr', v_order_id);
  return v_order_id;
end;
$$;

revoke all on function private.create_hr_late_order_core(uuid, uuid, uuid, date, jsonb, text, uuid) from public;

create or replace function public.create_hr_late_order(
  p_profile_id uuid,
  p_provider_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
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

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  perform private.assert_no_pending_staff_late_order_request_for_direct_hr_create(
    p_profile_id,
    p_provider_id,
    p_delivery_date
  );

  return private.create_hr_late_order_core(
    v_actor,
    p_profile_id,
    p_provider_id,
    p_delivery_date,
    p_items,
    p_special_instructions,
    p_office_location_id
  );
end;
$$;

revoke execute on function public.create_hr_late_order(uuid, uuid, date, jsonb, text, uuid) from public, anon;
grant execute on function public.create_hr_late_order(uuid, uuid, date, jsonb, text, uuid) to authenticated;

create or replace function private.staff_late_order_request_status_notification_eligible(
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
    and private.is_active_lunch_ordering_profile(p_profile_id)
    and exists (
      select 1 from auth.users u
      where u.id = p_profile_id
        and u.email is not null
        and btrim(u.email) <> ''
        and position('@' in btrim(u.email)) > 0
    )
    and exists (
      select 1 from private.notification_email_templates t
      where t.event_key = p_event_key and t.active
    );
$$;

revoke all on function private.staff_late_order_request_status_notification_eligible(uuid, text) from public;

create or replace function private.notify_hr_late_order_submitted(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.staff_late_order_requests%rowtype;
  v_operational_date date;
  v_batch_id uuid;
  v_hr record;
  v_idempotency_key text;
begin
  if p_request_id is null or not private.notification_globally_enabled('hr.late_order_submitted') then
    return;
  end if;

  select * into v_request from private.staff_late_order_requests r where r.id = p_request_id;
  if not found or v_request.status <> 'pending' then
    return;
  end if;

  v_operational_date := v_request.scheduled_delivery_date;

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr' and p.account_status = 'active'
  loop
    if not private.hr_operational_notification_recipient_eligible(v_hr.profile_id, 'hr.late_order_submitted') then
      continue;
    end if;

    if v_batch_id is null then
      insert into private.notification_delivery_batch (event_key, operational_date)
      values ('hr.late_order_submitted', v_operational_date)
      returning id into v_batch_id;
    end if;

    v_idempotency_key := 'hr.late_order_submitted:' || p_request_id::text || ':' || v_hr.profile_id::text;

    insert into private.notification_delivery_log (
      event_key, profile_id, operational_date, batch_id, status, idempotency_key, staff_late_order_request_id
    )
    values (
      'hr.late_order_submitted', v_hr.profile_id, v_operational_date, v_batch_id, 'pending',
      v_idempotency_key, p_request_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;
exception when others then
  raise warning 'notify_hr_late_order_submitted failed for %: %', p_request_id, sqlerrm;
end;
$$;

revoke all on function private.notify_hr_late_order_submitted(uuid) from public;

create or replace function private.safe_notify_hr_late_order_submitted(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_hr_late_order_submitted(p_request_id);
exception when others then
  raise warning 'safe_notify_hr_late_order_submitted failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_hr_late_order_submitted(uuid) from public;

create or replace function private.notify_staff_late_order_request_status(
  p_request_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.staff_late_order_requests%rowtype;
  v_batch_id uuid;
  v_idempotency_key text;
begin
  if p_request_id is null or p_event_key is null then
    return;
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id;
  if not found then
    return;
  end if;

  if not private.staff_late_order_request_status_notification_eligible(
    v_request.requester_profile_id, p_event_key
  ) then
    return;
  end if;

  v_idempotency_key := p_event_key || ':' || p_request_id::text || ':' || v_request.requester_profile_id::text;

  insert into private.notification_delivery_batch (event_key, operational_date)
  values (p_event_key, v_request.scheduled_delivery_date)
  returning id into v_batch_id;

  insert into private.notification_delivery_log (
    event_key, profile_id, operational_date, batch_id, status, idempotency_key, staff_late_order_request_id
  )
  values (
    p_event_key, v_request.requester_profile_id, v_request.scheduled_delivery_date,
    v_batch_id, 'pending', v_idempotency_key, p_request_id
  )
  on conflict (idempotency_key) do nothing;
exception when others then
  raise warning 'notify_staff_late_order_request_status failed: %', sqlerrm;
end;
$$;

revoke all on function private.notify_staff_late_order_request_status(uuid, text) from public;

create or replace function private.safe_notify_staff_late_order_request_status(
  p_request_id uuid,
  p_event_key text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_staff_late_order_request_status(p_request_id, p_event_key);
exception when others then
  raise warning 'safe_notify_staff_late_order_request_status failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_staff_late_order_request_status(uuid, text) from public;

create or replace function public.create_staff_late_order_request(
  p_provider_id uuid,
  p_scheduled_delivery_date date,
  p_requested_summary text,
  p_quantity integer default 1,
  p_special_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_location_id uuid;
  v_order_date date;
  v_summary text := btrim(p_requested_summary);
  v_instructions text;
  v_request_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if v_summary is null or char_length(v_summary) = 0 or char_length(v_summary) > 500 then
    raise exception 'Request summary is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  v_instructions := nullif(btrim(coalesce(p_special_instructions, '')), '');
  if v_instructions is not null and char_length(v_instructions) > 500 then
    raise exception 'Special instructions are too long';
  end if;

  select p.default_office_location_id into v_location_id
  from public.profiles p where p.id = v_actor;

  if v_location_id is null then
    raise exception 'Default office location is required';
  end if;

  perform private.assert_staff_late_order_request_window(v_actor, p_provider_id, p_scheduled_delivery_date);

  if private.profile_has_submitted_late_order(v_actor, p_provider_id, p_scheduled_delivery_date) then
    raise exception 'A late order already exists for this provider and delivery date';
  end if;

  v_order_date := public.order_date_for_delivery_date(p_scheduled_delivery_date, v_location_id);

  insert into private.staff_late_order_requests (
    requester_profile_id, provider_id, office_location_id, order_date, scheduled_delivery_date,
    status, requested_summary, quantity, special_instructions
  )
  values (
    v_actor, p_provider_id, v_location_id, v_order_date, p_scheduled_delivery_date,
    'pending', v_summary, p_quantity, v_instructions
  )
  returning id into v_request_id;

  perform private.insert_staff_late_order_request_event(
    v_request_id, 'submitted', v_actor,
    jsonb_build_object('provider_id', p_provider_id, 'scheduled_delivery_date', p_scheduled_delivery_date)
  );

  perform private.safe_notify_hr_late_order_submitted(v_request_id);
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A pending request already exists for this provider and delivery date';
end;
$$;

revoke execute on function public.create_staff_late_order_request(uuid, date, text, integer, text) from public, anon;
grant execute on function public.create_staff_late_order_request(uuid, date, text, integer, text) to authenticated;

create or replace function public.update_staff_late_order_request(
  p_request_id uuid,
  p_requested_summary text,
  p_quantity integer,
  p_special_instructions text default null,
  p_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
  v_summary text := btrim(p_requested_summary);
  v_instructions text;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.requester_profile_id <> v_actor then
    raise exception 'Request access denied';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be edited';
  end if;

  if p_expected_updated_at is not null and v_request.updated_at <> p_expected_updated_at then
    raise exception 'Request was updated elsewhere; refresh and try again';
  end if;

  perform private.assert_staff_late_order_request_window(
    v_actor, v_request.provider_id, v_request.scheduled_delivery_date
  );

  if v_summary is null or char_length(v_summary) = 0 or char_length(v_summary) > 500 then
    raise exception 'Request summary is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  v_instructions := nullif(btrim(coalesce(p_special_instructions, '')), '');
  if v_instructions is not null and char_length(v_instructions) > 500 then
    raise exception 'Special instructions are too long';
  end if;

  update private.staff_late_order_requests
  set requested_summary = v_summary,
      quantity = p_quantity,
      special_instructions = v_instructions
  where id = p_request_id;

  perform private.insert_staff_late_order_request_event(
    p_request_id, 'updated', v_actor,
    jsonb_build_object('quantity', p_quantity)
  );
end;
$$;

revoke execute on function public.update_staff_late_order_request(uuid, text, integer, text, timestamptz) from public, anon;
grant execute on function public.update_staff_late_order_request(uuid, text, integer, text, timestamptz) to authenticated;

create or replace function public.cancel_staff_late_order_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.requester_profile_id <> v_actor then
    raise exception 'Request access denied';
  end if;

  if v_request.status = 'cancelled' then
    return;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled';
  end if;

  update private.staff_late_order_requests
  set status = 'cancelled', cancelled_at = now()
  where id = p_request_id;

  perform private.insert_staff_late_order_request_event(p_request_id, 'cancelled', v_actor, '{}'::jsonb);

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);
end;
$$;

revoke execute on function public.cancel_staff_late_order_request(uuid) from public, anon;
grant execute on function public.cancel_staff_late_order_request(uuid) to authenticated;

create or replace function public.get_my_staff_late_order_requests()
returns table (
  id uuid,
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date,
  status text,
  requested_summary text,
  quantity integer,
  special_instructions text,
  decline_reason text,
  fulfilled_order_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    r.id, r.provider_id, lp.name, r.order_date, r.scheduled_delivery_date, r.status,
    r.requested_summary, r.quantity, r.special_instructions, r.decline_reason,
    r.fulfilled_order_id, r.created_at, r.updated_at
  from private.staff_late_order_requests r
  inner join public.lunch_providers lp on lp.id = r.provider_id
  where r.requester_profile_id = v_actor
  order by r.created_at desc
  limit 20;
end;
$$;

revoke execute on function public.get_my_staff_late_order_requests() from public, anon;
grant execute on function public.get_my_staff_late_order_requests() to authenticated;

create or replace function public.list_staff_late_order_eligible_cycles()
returns table (
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_today date := private.jamaica_today_date();
  v_location_id uuid;
  v_delivery date;
  v_order_date date;
  v_provider record;
  v_next_delivery date;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_active_lunch_ordering_profile(v_actor) then
    return;
  end if;

  select p.default_office_location_id into v_location_id from public.profiles p where p.id = v_actor;
  if v_location_id is null then
    return;
  end if;

  v_next_delivery := public.delivery_date_for_order_date(v_today, v_location_id);

  for v_provider in
    select lp.id, lp.name
    from public.lunch_providers lp
    where lp.active and lp.accepts_late_orders
    order by lp.name
  loop
    for v_delivery in
      select dd.delivery_date
      from (
        select v_today as delivery_date
        union
        select v_next_delivery
      ) dd
      where dd.delivery_date is not null
    loop
      begin
        perform private.assert_staff_late_order_request_window(v_actor, v_provider.id, v_delivery);
        v_order_date := public.order_date_for_delivery_date(v_delivery, v_location_id);
        provider_id := v_provider.id;
        provider_name := v_provider.name;
        order_date := v_order_date;
        scheduled_delivery_date := v_delivery;
        return next;
      exception when others then
        continue;
      end;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.list_staff_late_order_eligible_cycles() from public, anon;
grant execute on function public.list_staff_late_order_eligible_cycles() to authenticated;

create or replace function public.list_pending_staff_late_order_requests_for_hr()
returns table (
  id uuid,
  requester_profile_id uuid,
  requester_name text,
  requester_email text,
  provider_id uuid,
  provider_name text,
  order_date date,
  scheduled_delivery_date date,
  requested_summary text,
  quantity integer,
  special_instructions text,
  office_location_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  return query
  select
    r.id, r.requester_profile_id, p.full_name, u.email::text,
    r.provider_id, lp.name, r.order_date, r.scheduled_delivery_date,
    r.requested_summary, r.quantity, r.special_instructions, r.office_location_id,
    r.created_at, r.updated_at
  from private.staff_late_order_requests r
  inner join public.profiles p on p.id = r.requester_profile_id
  inner join auth.users u on u.id = r.requester_profile_id
  inner join public.lunch_providers lp on lp.id = r.provider_id
  where r.status = 'pending'
  order by r.created_at asc;
end;
$$;

revoke execute on function public.list_pending_staff_late_order_requests_for_hr() from public, anon;
grant execute on function public.list_pending_staff_late_order_requests_for_hr() to authenticated;

create or replace function public.fulfill_staff_late_order_request(
  p_request_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
  v_order_id uuid;
  v_location uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.status = 'fulfilled' then
    return v_request.fulfilled_order_id;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be fulfilled';
  end if;

  perform private.assert_staff_late_order_request_window(
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date
  );

  if private.profile_has_submitted_late_order(
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date
  ) then
    raise exception 'A late order already exists for this employee, provider, and delivery date';
  end if;

  v_location := coalesce(p_office_location_id, v_request.office_location_id);

  v_order_id := private.create_hr_late_order_core(
    v_actor,
    v_request.requester_profile_id,
    v_request.provider_id,
    v_request.scheduled_delivery_date,
    p_items,
    p_special_instructions,
    v_location
  );

  update private.staff_late_order_requests
  set status = 'fulfilled',
      fulfilled_at = now(),
      fulfilled_order_id = v_order_id,
      reviewed_by = v_actor
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Request is no longer pending';
  end if;

  perform private.insert_staff_late_order_request_event(
    p_request_id, 'fulfilled', v_actor,
    jsonb_build_object('fulfilled_order_id', v_order_id)
  );

  perform private.safe_notify_staff_late_order_request_status(
    p_request_id, 'staff.late_order_request_fulfilled'
  );

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);

  return v_order_id;
end;
$$;

revoke execute on function public.fulfill_staff_late_order_request(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.fulfill_staff_late_order_request(uuid, jsonb, text, uuid) to authenticated;

create or replace function public.decline_staff_late_order_request(
  p_request_id uuid,
  p_decline_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_user_id();
  v_request private.staff_late_order_requests%rowtype;
  v_reason text := btrim(p_decline_reason);
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR late-order access required';
  end if;

  if v_reason is null or char_length(v_reason) = 0 or char_length(v_reason) > 500 then
    raise exception 'Decline reason is required';
  end if;

  select * into v_request from private.staff_late_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be declined';
  end if;

  update private.staff_late_order_requests
  set status = 'declined',
      declined_at = now(),
      reviewed_by = v_actor,
      decline_reason = v_reason
  where id = p_request_id;

  perform private.insert_staff_late_order_request_event(
    p_request_id, 'declined', v_actor,
    jsonb_build_object('decline_reason', v_reason)
  );

  perform private.safe_notify_staff_late_order_request_status(
    p_request_id, 'staff.late_order_request_declined'
  );

  perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(p_request_id);
end;
$$;

revoke execute on function public.decline_staff_late_order_request(uuid, text) from public, anon;
grant execute on function public.decline_staff_late_order_request(uuid, text) to authenticated;

create or replace function public.worker_expire_pending_staff_late_order_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_expired integer := 0;
  v_deadline timestamptz;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  for v_request in
    select r.*
    from private.staff_late_order_requests r
    where r.status = 'pending'
    for update skip locked
  loop
    v_deadline := public.provider_late_order_deadline_at(
      v_request.provider_id,
      v_request.order_date,
      v_request.scheduled_delivery_date
    );

    if v_deadline is null or now() <= v_deadline then
      continue;
    end if;

    update private.staff_late_order_requests
    set status = 'expired', expired_at = now()
    where id = v_request.id and status = 'pending';

    if found then
      perform private.insert_staff_late_order_request_event(
        v_request.id, 'expired', null, '{}'::jsonb
      );
      perform private.safe_notify_staff_late_order_request_status(
        v_request.id, 'staff.late_order_request_expired'
      );
      perform private.safe_suppress_unsent_hr_late_order_submitted_deliveries(v_request.id);
      v_expired := v_expired + 1;
    end if;
  end loop;

  return v_expired;
end;
$$;

revoke execute on function public.worker_expire_pending_staff_late_order_requests() from public, anon, authenticated;
grant execute on function public.worker_expire_pending_staff_late_order_requests() to service_role;

-- Worker notification listing (HR submitted)
create or replace function public.worker_list_pending_hr_late_order_submitted_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  event_key text,
  profile_id uuid,
  recipient_email text,
  staff_late_order_request_id uuid
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
  select d.id, d.event_key, d.profile_id, u.email::text, d.staff_late_order_request_id
  from private.notification_delivery_log d
  inner join auth.users u on u.id = d.profile_id
  inner join private.staff_late_order_requests r on r.id = d.staff_late_order_request_id
  where d.event_key = 'hr.late_order_submitted'
    and d.status = 'pending'
    and d.staff_late_order_request_id is not null
    and r.status = 'pending'
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

grant execute on function public.worker_list_pending_hr_late_order_submitted_deliveries(integer) to service_role;

create or replace function public.worker_get_hr_late_order_submitted_context(p_request_id uuid)
returns table (
  employee_name text,
  provider_name text,
  delivery_date text,
  requested_summary text,
  submitted_at text
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
    coalesce(p.full_name, 'Employee'),
    lp.name,
    to_char(r.scheduled_delivery_date, 'YYYY-MM-DD'),
    r.requested_summary,
    to_char(r.created_at at time zone 'America/Jamaica', 'YYYY-MM-DD HH24:MI')
  from private.staff_late_order_requests r
  inner join public.profiles p on p.id = r.requester_profile_id
  inner join public.lunch_providers lp on lp.id = r.provider_id
  where r.id = p_request_id
    and r.status = 'pending';
end;
$$;

grant execute on function public.worker_get_hr_late_order_submitted_context(uuid) to service_role;

create or replace function public.worker_list_pending_staff_late_order_request_status_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  event_key text,
  profile_id uuid,
  recipient_email text,
  staff_late_order_request_id uuid
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
  select d.id, d.event_key, d.profile_id, u.email::text, d.staff_late_order_request_id
  from private.notification_delivery_log d
  inner join auth.users u on u.id = d.profile_id
  where d.event_key in (
    'staff.late_order_request_fulfilled',
    'staff.late_order_request_declined',
    'staff.late_order_request_expired'
  )
    and d.status = 'pending'
    and d.staff_late_order_request_id is not null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

grant execute on function public.worker_list_pending_staff_late_order_request_status_deliveries(integer) to service_role;

create or replace function public.worker_get_staff_late_order_request_status_context(p_request_id uuid)
returns table (
  first_name text,
  provider_name text,
  delivery_date text,
  requested_summary text,
  decline_reason text
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
    split_part(coalesce(p.full_name, ''), ' ', 1),
    lp.name,
    to_char(r.scheduled_delivery_date, 'YYYY-MM-DD'),
    r.requested_summary,
    coalesce(r.decline_reason, '')
  from private.staff_late_order_requests r
  inner join public.profiles p on p.id = r.requester_profile_id
  inner join public.lunch_providers lp on lp.id = r.provider_id
  where r.id = p_request_id;
end;
$$;

grant execute on function public.worker_get_staff_late_order_request_status_context(uuid) to service_role;

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

  select * into v_delivery from private.notification_delivery_log d where d.id = p_delivery_id for update;
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
    when 'hr.late_order_submitted' then 'notification_hr_late_order_submitted'
    when 'admin.email_delivery_failure' then 'notification_admin_email_delivery_failure'
    when 'hr.email_delivery_failure' then 'notification_hr_email_delivery_failure'
    when 'staff.lunch_period_finalized' then 'notification_lunch_period_finalized'
    when 'staff.late_order_request_fulfilled' then 'notification_staff_late_order_request'
    when 'staff.late_order_request_declined' then 'notification_staff_late_order_request'
    when 'staff.late_order_request_expired' then 'notification_staff_late_order_request'
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

drop function if exists public.fetch_hr_late_order_snapshot_menu(uuid, date);

drop function if exists public.fetch_hr_late_order_snapshot_menu(uuid, date);

create or replace function public.fetch_hr_late_order_snapshot_menu(
  p_provider_id uuid,
  p_delivery_date date,
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  v_jamaica_today date := private.jamaica_today_date();
  v_lunch_day_id uuid;
  v_items jsonb;
  v_accepts boolean;
  v_location_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_orders()) then
    raise exception 'HR late-order access required';
  end if;

  select lp.accepts_late_orders
  into v_accepts
  from public.lunch_providers lp
  where lp.id = p_provider_id
    and lp.active = true;

  if not coalesce(v_accepts, false) then
    raise exception 'Provider does not accept late orders';
  end if;

  if p_profile_id is not null then
    select p.default_office_location_id
    into v_location_id
    from public.profiles p
    where p.id = p_profile_id;
  end if;

  v_order_date := public.order_date_for_delivery_date(p_delivery_date, v_location_id);

  if v_order_date is null
     or public.delivery_date_for_order_date(v_order_date, v_location_id) <> p_delivery_date then
    return jsonb_build_object(
      'status', 'invalid_cycle',
      'order_date', null,
      'delivery_date', p_delivery_date,
      'menu_items', '[]'::jsonb
    );
  end if;

  v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(p_provider_id, v_order_date);

  if v_lunch_day_id is null then
    if v_order_date < v_jamaica_today then
      return jsonb_build_object(
        'status', 'historical_unavailable',
        'order_date', v_order_date,
        'delivery_date', p_delivery_date,
        'menu_items', '[]'::jsonb
      );
    elsif v_order_date = v_jamaica_today then
      v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
    else
      return jsonb_build_object(
        'status', 'future_unavailable',
        'order_date', v_order_date,
        'delivery_date', p_delivery_date,
        'menu_items', '[]'::jsonb
      );
    end if;
  elsif v_order_date = v_jamaica_today then
    v_lunch_day_id := private.ensure_provider_lunch_day(p_provider_id, v_order_date);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mi.id,
        'name', mi.name,
        'description', mi.description,
        'price', mi.price,
        'item_type', mi.item_type,
        'unit_label', mi.unit_label,
        'display_category', mi.display_category
      )
      order by mi.item_type, mi.name
    ),
    '[]'::jsonb
  )
  into v_items
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id
    and mi.is_active = true;

  return jsonb_build_object(
    'status', 'available',
    'order_date', v_order_date,
    'delivery_date', p_delivery_date,
    'menu_items', v_items
  );
end;
$$;

revoke execute on function public.fetch_hr_late_order_snapshot_menu(uuid, date, uuid) from public, anon;
grant execute on function public.fetch_hr_late_order_snapshot_menu(uuid, date, uuid) to authenticated;

