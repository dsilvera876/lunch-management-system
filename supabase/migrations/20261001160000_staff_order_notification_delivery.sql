-- Event-driven staff order email notifications (delivery intent + worker queue).

alter table private.notification_delivery_log
  add column if not exists idempotency_key text,
  add column if not exists order_id uuid references public.orders (id) on delete set null;

update private.notification_delivery_log d
set idempotency_key = d.event_key || ':' || d.profile_id::text || ':' || d.operational_date::text
where d.idempotency_key is null
  and d.profile_id is not null
  and d.operational_date is not null;

alter table private.notification_delivery_log
  alter column idempotency_key set not null;

alter table private.notification_delivery_log
  drop constraint if exists notification_delivery_log_event_profile_date_key;

create unique index if not exists notification_delivery_log_idempotency_key_idx
  on private.notification_delivery_log (idempotency_key);

create unique index if not exists notification_delivery_log_today_menu_occurrence_idx
  on private.notification_delivery_log (event_key, profile_id, operational_date)
  where event_key = 'staff.today_menu';

alter table private.notification_delivery_batch
  drop constraint if exists notification_delivery_batch_event_date_key;

create unique index if not exists notification_delivery_batch_today_menu_occurrence_idx
  on private.notification_delivery_batch (event_key, operational_date)
  where event_key = 'staff.today_menu';

create table if not exists private.order_notification_lifecycle (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_notification_lifecycle_order_id_idx
  on private.order_notification_lifecycle (order_id, created_at desc);

revoke all on private.order_notification_lifecycle from public, anon, authenticated;

update private.notification_event_catalog c
set
  display_name = case c.event_key
    when 'staff.order_changed' then 'Order updated'
    when 'staff.changed_by_hr' then 'Changed by HR'
    else c.display_name
  end,
  allowed_variables = case c.event_key
    when 'staff.order_submitted' then array[
      'first_name', 'order_date', 'provider_name', 'order_summary', 'order_total', 'order_url'
    ]
    when 'staff.order_changed' then array[
      'first_name', 'order_date', 'provider_name', 'order_summary', 'order_total', 'order_url'
    ]
    when 'staff.order_cancelled' then array[
      'first_name', 'order_date', 'provider_name', 'order_summary', 'order_total', 'order_url', 'reorder_message'
    ]
    when 'staff.changed_by_hr' then array[
      'first_name', 'order_date', 'provider_name', 'order_summary', 'order_total', 'order_url'
    ]
    else c.allowed_variables
  end
where c.event_key in (
  'staff.order_submitted',
  'staff.order_changed',
  'staff.order_cancelled',
  'staff.changed_by_hr'
);

update private.notification_email_templates t
set
  body_html_template = replace(t.body_html_template, ' (Jamaica time)', ''),
  body_text_template = replace(t.body_text_template, ' (Jamaica time)', '')
where t.event_key = 'staff.today_menu'
  and (
    t.body_html_template like '%Jamaica time%'
    or coalesce(t.body_text_template, '') like '%Jamaica time%'
  );

insert into private.notification_email_templates (
  event_key, subject_template, body_html_template, body_text_template
)
values
  (
    'staff.order_submitted',
    'Lunch order confirmed for {{order_date}}',
    '<p>Hi {{first_name}},</p><p>Your lunch order for <strong>{{order_date}}</strong> has been submitted.</p><p><strong>Provider:</strong><br>{{provider_name}}</p><p><strong>Order:</strong><br>{{order_summary}}</p><p><strong>Total:</strong> {{order_total}}</p><p>You can review your order here:<br><a href="{{order_url}}">{{order_url}}</a></p>',
    'Hi {{first_name}},

Your lunch order for {{order_date}} has been submitted.

Provider:
{{provider_name}}

Order:
{{order_summary}}

Total: {{order_total}}

You can review your order here:
{{order_url}}'
  ),
  (
    'staff.order_changed',
    'Lunch order updated for {{order_date}}',
    '<p>Hi {{first_name}},</p><p>Your lunch order for <strong>{{order_date}}</strong> has been updated.</p><p><strong>Provider:</strong><br>{{provider_name}}</p><p><strong>Updated order:</strong><br>{{order_summary}}</p><p><strong>Total:</strong> {{order_total}}</p><p><a href="{{order_url}}">{{order_url}}</a></p>',
    'Hi {{first_name}},

Your lunch order for {{order_date}} has been updated.

Provider:
{{provider_name}}

Updated order:
{{order_summary}}

Total: {{order_total}}

{{order_url}}'
  ),
  (
    'staff.order_cancelled',
    'Lunch order cancelled for {{order_date}}',
    '<p>Hi {{first_name}},</p><p>Your lunch order for <strong>{{order_date}}</strong> has been cancelled.</p><p>{{reorder_message}}</p>',
    'Hi {{first_name}},

Your lunch order for {{order_date}} has been cancelled.

{{reorder_message}}'
  ),
  (
    'staff.changed_by_hr',
    'Your lunch order was updated for {{order_date}}',
    '<p>Hi {{first_name}},</p><p>Your lunch order for <strong>{{order_date}}</strong> was updated by HR.</p><p><strong>Current order:</strong><br>{{order_summary}}</p><p><strong>Provider:</strong><br>{{provider_name}}</p><p><strong>Total:</strong> {{order_total}}</p><p><a href="{{order_url}}">{{order_url}}</a></p>',
    'Hi {{first_name}},

Your lunch order for {{order_date}} was updated by HR.

Current order:
{{order_summary}}

Provider:
{{provider_name}}

Total: {{order_total}}

{{order_url}}'
  )
on conflict (event_key) do nothing;

create or replace function private.format_order_email_summary(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    string_agg(
      mi.name
        || case
          when mi.unit_label is not null
            and btrim(mi.unit_label) <> ''
            and lower(btrim(mi.unit_label)) <> 'each'
          then ' (' || mi.unit_label || ')'
          else ''
        end
        || ' × ' || oi.quantity::text,
      E'\n'
      order by
        case mi.item_type
          when 'main' then 0
          when 'side' then 1
          when 'standalone' then 2
          else 3
        end,
        mi.name
    ),
    ''
  )
  from public.order_items oi
  inner join public.menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = p_order_id;
$$;

revoke all on function private.format_order_email_summary(uuid) from public;

create or replace function private.staff_order_notification_eligible(
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
    private.is_active_lunch_ordering_profile(p_profile_id)
    and private.notification_globally_enabled(p_event_key)
    and private.effective_staff_notification_preference(p_profile_id, p_event_key)
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
      where t.event_key = p_event_key
        and t.active
    );
$$;

revoke all on function private.staff_order_notification_eligible(uuid, text) from public;

create or replace function private.notify_staff_order_event(
  p_event_key text,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle_id uuid;
  v_profile_id uuid;
  v_order_date date;
  v_batch_id uuid;
  v_idempotency_key text;
begin
  if p_event_key is null or p_order_id is null then
    return;
  end if;

  select o.profile_id, ld.order_date
  into v_profile_id, v_order_date
  from public.orders o
  inner join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.id = p_order_id;

  if not found then
    return;
  end if;

  if not private.staff_order_notification_eligible(v_profile_id, p_event_key) then
    return;
  end if;

  insert into private.order_notification_lifecycle (order_id, event_key)
  values (p_order_id, p_event_key)
  returning id into v_lifecycle_id;

  v_idempotency_key := p_event_key || ':' || v_lifecycle_id::text;

  insert into private.notification_delivery_batch (event_key, operational_date)
  values (p_event_key, v_order_date)
  returning id into v_batch_id;

  insert into private.notification_delivery_log (
    event_key,
    profile_id,
    operational_date,
    batch_id,
    status,
    idempotency_key,
    order_id
  )
  values (
    p_event_key,
    v_profile_id,
    v_order_date,
    v_batch_id,
    'pending',
    v_idempotency_key,
    p_order_id
  )
  on conflict (idempotency_key) do nothing;
exception
  when others then
    raise warning 'notify_staff_order_event failed for order % event %: %',
      p_order_id, p_event_key, sqlerrm;
end;
$$;

revoke all on function private.notify_staff_order_event(text, uuid) from public;

create or replace function private.safe_notify_staff_order_event(
  p_event_key text,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_staff_order_event(p_event_key, p_order_id);
exception
  when others then
    raise warning 'safe_notify_staff_order_event failed: %', sqlerrm;
end;
$$;

revoke all on function private.safe_notify_staff_order_event(text, uuid) from public;

create or replace function public.worker_get_staff_order_notification_context(p_order_id uuid)
returns table (
  provider_name text,
  order_summary text,
  order_total numeric,
  order_status text,
  ordering_still_open boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_day_status text;
  v_deadline timestamptz;
  v_order_date date;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id;

  if not found then
    return;
  end if;

  select ld.status, public.effective_order_deadline(ld.id), ld.order_date
  into v_day_status, v_deadline, v_order_date
  from public.lunch_days ld
  where ld.id = v_order.lunch_day_id;

  return query
  select
    lp.name,
    private.format_order_email_summary(p_order_id),
    public.calculate_order_total(p_order_id),
    v_order.status,
    (
      v_order.status = 'submitted'
      and v_day_status = 'open'
      and now() <= v_deadline
    );
end;
$$;

revoke execute on function public.worker_get_staff_order_notification_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_staff_order_notification_context(uuid) to service_role;

create or replace function public.worker_list_pending_staff_order_deliveries(
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  event_key text,
  order_id uuid,
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
    d.order_id,
    d.operational_date,
    lower(btrim(u.email)),
    coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  from private.notification_delivery_log d
  inner join public.profiles p on p.id = d.profile_id
  inner join auth.users u on u.id = d.profile_id
  where d.event_key = any (array[
    'staff.order_submitted',
    'staff.order_changed',
    'staff.order_cancelled',
    'staff.changed_by_hr'
  ]::text[])
    and d.status = 'pending'
    and d.email_queue_id is null
    and d.order_id is not null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  for update skip locked;
end;
$$;

revoke execute on function public.worker_list_pending_staff_order_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.worker_list_pending_staff_order_deliveries(integer) to service_role;

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

revoke execute on function public.worker_queue_notification_delivery(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.worker_queue_notification_delivery(uuid, text, text, text, text)
  to service_role;

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
begin
  return public.worker_queue_notification_delivery(
    p_delivery_id,
    p_recipient_email,
    p_subject,
    p_text_body,
    p_html_body
  );
end;
$$;

-- Today''s Menu batch prepare: idempotency_key + partial unique batch upsert.

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
      'send_time', v_send_time,
      'window_open', false
    );
  end if;

  if not private.order_date_has_staff_menu(v_order_date) then
    return jsonb_build_object(
      'action', 'skipped',
      'reason', 'no_menu',
      'order_date', v_order_date,
      'send_time', v_send_time,
      'window_open', true
    );
  end if;

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

  for v_profile in
    select p.id
    from public.profiles p
    where private.is_active_lunch_ordering_profile(p.id)
  loop
    v_candidates := v_candidates + 1;

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
    end if;
  end loop;

  select count(*)
  into v_delivery_count
  from private.notification_delivery_log d
  where d.batch_id = v_batch_id;

  if v_delivery_count = 0 then
    delete from private.notification_delivery_batch b
    where b.id = v_batch_id;

    v_batch_id := null;
  end if;

  return jsonb_build_object(
    'action', 'prepared',
    'batch_id', v_batch_id,
    'order_date', v_order_date,
    'send_time', v_send_time,
    'window_open', true,
    'candidates', v_candidates,
    'eligible_count', v_eligible_count,
    'inserted', v_inserted,
    'skip_reason_counts', v_skip_reason_counts
  );
end;
$$;

-- Order mutation hooks (notification intent; email transport failures never roll back orders).
-- Included from 20261001160000_staff_order_notification_delivery.sql (not a standalone migration).

create or replace function private.insert_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid,
  p_order_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  v_meal_quantity := private.validate_provider_order_payload(
    p_provider_id,
    p_items
  );

  v_items := private.build_provider_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  perform private.assert_order_date_allows_ordering(p_order_date, v_location_id);

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on this date';
  end if;

  v_special_instructions :=
    private.normalize_special_instructions(p_special_instructions);

  if p_special_instructions is not null
     and length(trim(p_special_instructions)) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.validate_order_date_not_in_finalized_period(p_order_date);

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  v_lunch_day_id := private.ensure_provider_lunch_day(
    p_provider_id,
    p_order_date
  );

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_provider_menu_item_id :=
        (v_item ->> 'provider_menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id
      and mi.is_active = true;

    if not found then
      raise exception
        'Menu item % for provider % is invalid or inactive on lunch day %',
        v_provider_menu_item_id,
        p_provider_id,
        v_lunch_day_id;
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    special_instructions,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address,
    order_group_id
  )
  values (
    v_actor,
    v_lunch_day_id,
    v_special_instructions,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address,
    p_order_group_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    v_provider_menu_item_id :=
      (v_item ->> 'provider_menu_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  perform private.safe_notify_staff_order_event('staff.order_submitted', v_order_id);

  return v_order_id;
end;
$$;

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_update_instructions boolean := p_special_instructions is not null;
  v_current_location_id uuid;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_order_date date;
  v_before_items jsonb;
  v_before_meal_quantity integer;
  v_before_special_instructions text;
  v_before_location_id uuid;
  v_changed boolean := false;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be edited';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);
  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id), ld.order_date
  into v_day_status, v_deadline, v_order_date
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  select office_location_id, meal_quantity, special_instructions
  into v_current_location_id, v_before_meal_quantity, v_before_special_instructions
  from public.orders
  where id = p_order_id;

  v_before_items := private.order_items_audit_snapshot(p_order_id);
  v_before_location_id := v_current_location_id;

  v_location_id := coalesce(p_office_location_id, v_current_location_id);

  perform private.assert_order_date_allows_ordering(v_order_date, v_location_id);

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(
    v_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if v_update_instructions then
    v_special_instructions :=
      private.normalize_special_instructions(p_special_instructions);

    if length(trim(coalesce(p_special_instructions, ''))) > 0
       and v_special_instructions is null then
      raise exception 'Special instructions are too long';
    end if;
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  if p_office_location_id is not null
     and p_office_location_id is distinct from v_current_location_id then
    select *
    into v_location_id, v_location_name, v_location_address
    from private.resolve_active_office_location_snapshot(p_office_location_id);

    update public.orders
    set
      meal_quantity = v_meal_quantity,
      office_location_id = v_location_id,
      office_location_name = v_location_name,
      office_location_address = v_location_address
    where id = p_order_id;
  else
    update public.orders
    set meal_quantity = v_meal_quantity
    where id = p_order_id;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;

  if v_update_instructions then
    update public.orders
    set special_instructions = v_special_instructions
    where id = p_order_id;
  end if;

  v_changed :=
    v_before_items is distinct from private.order_items_audit_snapshot(p_order_id)
    or v_before_meal_quantity is distinct from v_meal_quantity
    or (
      v_update_instructions
      and v_before_special_instructions is distinct from v_special_instructions
    )
    or (
      p_office_location_id is not null
      and v_before_location_id is distinct from v_location_id
    );

  if v_changed then
    perform private.safe_notify_staff_order_event('staff.order_changed', p_order_id);
  end if;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be cancelled';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);
  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id;

  perform private.safe_notify_staff_order_event('staff.order_cancelled', p_order_id);
end;
$$;


create or replace function public.create_hr_late_order(p_profile_id uuid, p_provider_id uuid, p_delivery_date date, p_items jsonb, p_special_instructions text DEFAULT NULL::text, p_office_location_id uuid DEFAULT NULL::uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
   v_actor uuid;
   v_order_date date;
   v_lunch_day_id uuid;
   v_jamaica_today date := private.jamaica_today_date();
   v_company_deadline timestamptz;
   v_provider_deadline timestamptz;
   v_meal_quantity integer;
   v_items jsonb;
   v_item jsonb;
   v_menu_item_id uuid;
   v_quantity integer;
   v_order_id uuid;
   v_location_id uuid;
   v_location_name text;
   v_location_address text;
   v_special_instructions text;
   v_accepts boolean;
 begin
   v_actor := (select private.current_user_id());

   if v_actor is null then
     raise exception 'Authentication required';
   end if;

   if not (select private.can_view_all_orders()) then
     raise exception 'HR late-order access required';
   end if;

   if not exists (
     select 1
     from public.profiles pr
     where pr.id = p_profile_id
   ) then
     raise exception 'Employee not found';
   end if;

   select lp.accepts_late_orders
   into v_accepts
   from public.lunch_providers lp
   where lp.id = p_provider_id
     and lp.active = true;

   if not coalesce(v_accepts, false) then
     raise exception 'Provider does not accept late orders';
   end if;

   v_order_date := public.order_date_for_delivery_date(p_delivery_date);

   if v_order_date is null then
     raise exception 'Invalid delivery date';
   end if;

   if public.delivery_date_for_order_date(v_order_date) <> p_delivery_date then
     raise exception 'Delivery date does not match order cycle';
   end if;

   perform private.validate_order_date_not_in_finalized_period(v_order_date);

   v_company_deadline := public.order_deadline_for_order_date(v_order_date);

   if now() <= v_company_deadline then
     raise exception 'Normal ordering is still open; use standard ordering';
   end if;

   v_provider_deadline := public.provider_late_order_deadline_at(
     p_provider_id,
     v_order_date,
     p_delivery_date
   );

   if v_provider_deadline is null then
     raise exception 'Provider late-order deadline is not configured';
   end if;

   if now() > v_provider_deadline then
     raise exception 'Provider late-order deadline has passed';
   end if;

   v_lunch_day_id := private.lookup_provider_lunch_day_snapshot(
     p_provider_id,
     v_order_date
   );

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

   v_special_instructions :=
     private.normalize_special_instructions(p_special_instructions);

   if length(trim(coalesce(p_special_instructions, ''))) > 0
      and v_special_instructions is null then
     raise exception 'Special instructions are too long';
   end if;

   perform private.activate_bypass_order_deadline();

   insert into public.orders (
     profile_id,
     lunch_day_id,
     meal_quantity,
     office_location_id,
     office_location_name,
     office_location_address,
     special_instructions,
     is_late_order,
     late_order_created_by,
     late_order_approved_at,
     late_order_approved_by
   )
   values (
     p_profile_id,
     v_lunch_day_id,
     v_meal_quantity,
     v_location_id,
     v_location_name,
     v_location_address,
     v_special_instructions,
     true,
     v_actor,
     now(),
     v_actor
   )
   returning id into v_order_id;

   for v_item in
     select value
     from jsonb_array_elements(v_items)
   loop
     begin
       v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
       v_quantity := (v_item ->> 'quantity')::integer;
     exception
       when others then
         raise exception 'Invalid order item';
     end;

     if v_quantity is null or v_quantity <= 0 then
       raise exception 'Quantity must be greater than zero';
     end if;

     insert into public.order_items (
       order_id,
       menu_item_id,
       lunch_day_id,
       quantity
     )
     values (
       v_order_id,
       v_menu_item_id,
       v_lunch_day_id,
       v_quantity
     );
   end loop;

   perform private.safe_notify_staff_order_event('staff.changed_by_hr', v_order_id);
   return v_order_id;
end;
$$;

create or replace function public.adjust_operational_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_lunch_day_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_before jsonb;
  v_before_total numeric;
  v_after_total numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be adjusted';
  end if;

  if v_order.delivery_state <> 'issue_open' then
    raise exception 'Operational adjustments require an open delivery issue';
  end if;

  v_lunch_day_id := v_order.lunch_day_id;
  v_before := private.order_items_audit_snapshot(p_order_id);
  v_before_total := public.calculate_order_total(p_order_id);

  v_meal_quantity := private.validate_snapshot_order_payload(v_lunch_day_id, p_items);
  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  update public.orders
  set meal_quantity = v_meal_quantity
  where id = p_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;

  v_after_total := public.calculate_order_total(p_order_id);

  perform private.append_order_delivery_event(
    p_order_id,
    'order_adjusted',
    jsonb_build_object(
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'before_items', v_before,
      'after_items', private.order_items_audit_snapshot(p_order_id),
      'prior_total', v_before_total,
      'new_total', v_after_total
    )
  );


  perform private.safe_notify_staff_order_event('staff.changed_by_hr', p_order_id);
end;
$$;

create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
  v_order_date date;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  select ld.order_date
  into v_order_date
  from public.lunch_days ld
  where ld.id = p_lunch_day_id;

  if not found then
    raise exception 'Lunch day does not exist';
  end if;

  perform private.assert_order_date_allows_ordering(v_order_date, v_location_id);

  v_meal_quantity := private.validate_snapshot_order_payload(
    p_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address
  )
  values (
    v_actor,
    p_lunch_day_id,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  perform private.safe_notify_staff_order_event('staff.order_submitted', v_order_id);

  return v_order_id;
end;
$$;

