-- HR modify/cancel normal staff orders (Today's Orders), audit, dispatch guard, staff late-order RPC hardening.

-- ------------------------------------------------------------
-- Audit storage
-- ------------------------------------------------------------

create table private.hr_staff_order_mutation_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  subject_profile_id uuid not null references public.profiles (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('modified', 'cancelled')),
  reason text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index hr_staff_order_mutation_events_order_id_idx
  on private.hr_staff_order_mutation_events (order_id, created_at desc);

revoke all on table private.hr_staff_order_mutation_events from public, anon, authenticated;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

create or replace function private.normalize_hr_order_mutation_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_trimmed text;
begin
  v_trimmed := nullif(trim(coalesce(p_reason, '')), '');

  if v_trimmed is null then
    raise exception 'A reason is required for HR order changes';
  end if;

  if char_length(v_trimmed) > 1000 then
    raise exception 'HR order change reason is too long';
  end if;

  return v_trimmed;
end;
$$;

revoke all on function private.normalize_hr_order_mutation_reason(text) from public;

create or replace function private.provider_primary_dispatch_locks_orders(
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
    from public.provider_primary_order_dispatches d
    where d.provider_id = p_provider_id
      and d.scheduled_delivery_date = p_scheduled_delivery_date
      and d.status in ('pending', 'sent')
  );
$$;

revoke all on function private.provider_primary_dispatch_locks_orders(uuid, date) from public;

create or replace function private.validate_order_not_locked_by_primary_dispatch(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
  v_delivery_date date;
begin
  select ld.provider_id, ld.lunch_date
  into v_provider_id, v_delivery_date
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.id = p_order_id;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if private.provider_primary_dispatch_locks_orders(v_provider_id, v_delivery_date) then
    raise exception 'Provider primary order dispatch already sent';
  end if;
end;
$$;

revoke all on function private.validate_order_not_locked_by_primary_dispatch(uuid) from public;

create or replace function private.build_hr_staff_order_mutation_state(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order does not exist';
  end if;

  return jsonb_build_object(
    'status', v_order.status,
    'meal_quantity', v_order.meal_quantity,
    'delivery_state', v_order.delivery_state,
    'items', private.order_items_audit_snapshot(p_order_id),
    'order_total', public.calculate_order_total(p_order_id)
  );
end;
$$;

revoke all on function private.build_hr_staff_order_mutation_state(uuid) from public;

create or replace function private.insert_hr_staff_order_mutation_event(
  p_order_id uuid,
  p_subject_profile_id uuid,
  p_action text,
  p_reason text,
  p_before_state jsonb,
  p_after_state jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.hr_staff_order_mutation_events (
    order_id,
    subject_profile_id,
    actor_id,
    action,
    reason,
    before_state,
    after_state
  )
  values (
    p_order_id,
    p_subject_profile_id,
    (select private.current_user_id()),
    p_action,
    p_reason,
    coalesce(p_before_state, '{}'::jsonb),
    coalesce(p_after_state, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.insert_hr_staff_order_mutation_event(uuid, uuid, text, text, jsonb, jsonb)
from public;

create or replace function private.assert_hr_mutable_normal_staff_order_locked(
  p_order public.orders
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_status text;
begin
  if p_order.is_late_order then
    raise exception 'Late orders cannot be changed from Today''s Orders';
  end if;

  if p_order.status <> 'submitted' then
    raise exception 'Only submitted orders can be changed by HR';
  end if;

  if p_order.delivery_state <> 'pending' then
    raise exception 'Only pending deliveries can be changed by HR';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order.id);
  perform private.validate_provider_order_mutable(p_order.lunch_day_id);
  perform private.validate_order_not_locked_by_primary_dispatch(p_order.id);

  select ld.status
  into v_day_status
  from public.lunch_days ld
  where ld.id = p_order.lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;
end;
$$;

revoke all on function private.assert_hr_mutable_normal_staff_order_locked(public.orders) from public;

-- ------------------------------------------------------------
-- Staff self-service: reject late orders at DB layer
-- ------------------------------------------------------------

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
  v_is_late_order boolean;
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

  select profile_id, lunch_day_id, status, is_late_order
  into v_profile_id, v_lunch_day_id, v_order_status, v_is_late_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_is_late_order then
    raise exception 'Late orders cannot be edited through self-service';
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
  v_is_late_order boolean;
  v_day_status text;
  v_deadline timestamptz;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status, is_late_order
  into v_profile_id, v_lunch_day_id, v_order_status, v_is_late_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> v_actor then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_is_late_order then
    raise exception 'Late orders cannot be cancelled through self-service';
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

-- ------------------------------------------------------------
-- HR read helper for edit UI
-- ------------------------------------------------------------

create or replace function public.fetch_hr_staff_order_edit_context(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_provider_name text;
  v_order_date date;
  v_delivery_date date;
  v_menu_items jsonb;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order does not exist';
  end if;

  select lp.name, ld.order_date, ld.lunch_date
  into v_provider_name, v_order_date, v_delivery_date
  from public.lunch_days ld
  join public.lunch_providers lp on lp.id = ld.provider_id
  where ld.id = v_order.lunch_day_id;

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
  into v_menu_items
  from public.menu_items mi
  where mi.lunch_day_id = v_order.lunch_day_id
    and mi.is_active = true;

  return jsonb_build_object(
    'order_id', v_order.id,
    'updated_at', v_order.updated_at,
    'employee_profile_id', v_order.profile_id,
    'provider_name', v_provider_name,
    'order_date', v_order_date,
    'delivery_date', v_delivery_date,
    'meal_quantity', v_order.meal_quantity,
    'items', private.order_items_audit_snapshot(p_order_id),
    'menu_items', v_menu_items
  );
end;
$$;

revoke execute on function public.fetch_hr_staff_order_edit_context(uuid) from public, anon;
grant execute on function public.fetch_hr_staff_order_edit_context(uuid) to authenticated;

-- ------------------------------------------------------------
-- HR mutations
-- ------------------------------------------------------------

create or replace function public.hr_modify_staff_order(
  p_order_id uuid,
  p_items jsonb,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_order public.orders%rowtype;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_before_state jsonb;
  v_after_state jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  v_reason := private.normalize_hr_order_mutation_reason(p_reason);

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'Order changed; refresh and try again';
  end if;

  perform private.assert_hr_mutable_normal_staff_order_locked(v_order);

  v_before_state := private.build_hr_staff_order_mutation_state(p_order_id);
  v_before_items := v_before_state -> 'items';

  v_meal_quantity := private.validate_snapshot_order_payload(
    v_order.lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  perform private.activate_bypass_order_deadline();

  -- Preview after-items without mutating (rebuild from payload for comparison)
  v_after_items := (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'menu_item_id', (elem ->> 'menu_item_id')::uuid,
        'name', mi.name,
        'item_type', mi.item_type,
        'unit_label', mi.unit_label,
        'display_category', mi.display_category,
        'quantity', (elem ->> 'quantity')::integer,
        'unit_price', mi.price
      )
      order by mi.name
    ), '[]'::jsonb)
    from jsonb_array_elements(v_items) elem
    join public.menu_items mi
      on mi.id = (elem ->> 'menu_item_id')::uuid
     and mi.lunch_day_id = v_order.lunch_day_id
  );

  if v_before_items is not distinct from v_after_items
     and (v_before_state ->> 'meal_quantity')::integer is not distinct from v_meal_quantity then
    raise exception 'No changes were made to the order';
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
      v_order.lunch_day_id,
      v_quantity
    );
  end loop;

  v_after_state := private.build_hr_staff_order_mutation_state(p_order_id);

  perform private.insert_hr_staff_order_mutation_event(
    p_order_id,
    v_order.profile_id,
    'modified',
    v_reason,
    v_before_state,
    v_after_state
  );

  perform private.safe_notify_staff_order_event('staff.changed_by_hr', p_order_id);
end;
$$;

create or replace function public.hr_cancel_staff_order(
  p_order_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_order public.orders%rowtype;
  v_before_state jsonb;
  v_after_state jsonb;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_hr_operational_data()) then
    raise exception 'HR operational mutation access required';
  end if;

  v_reason := private.normalize_hr_order_mutation_reason(p_reason);

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'Order changed; refresh and try again';
  end if;

  perform private.assert_hr_mutable_normal_staff_order_locked(v_order);

  v_before_state := private.build_hr_staff_order_mutation_state(p_order_id);

  perform private.activate_bypass_order_deadline();

  update public.orders
  set status = 'cancelled'
  where id = p_order_id;

  v_after_state := private.build_hr_staff_order_mutation_state(p_order_id);

  perform private.insert_hr_staff_order_mutation_event(
    p_order_id,
    v_order.profile_id,
    'cancelled',
    v_reason,
    v_before_state,
    v_after_state
  );

  perform private.safe_notify_staff_order_event('staff.changed_by_hr', p_order_id);
end;
$$;

revoke execute on function public.hr_modify_staff_order(uuid, jsonb, text, timestamptz) from public, anon;
grant execute on function public.hr_modify_staff_order(uuid, jsonb, text, timestamptz) to authenticated;

revoke execute on function public.hr_cancel_staff_order(uuid, text, timestamptz) from public, anon;
grant execute on function public.hr_cancel_staff_order(uuid, text, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- staff.changed_by_hr templates: modified vs cancelled wording
-- ------------------------------------------------------------

update private.notification_event_catalog c
set allowed_variables = array[
  'first_name',
  'order_date',
  'provider_name',
  'order_summary',
  'order_total',
  'order_url',
  'hr_order_change_notice'
]
where c.event_key = 'staff.changed_by_hr';

update private.notification_email_templates t
set
  subject_template = 'Lunch order update for {{order_date}}',
  body_html_template = '<p>Hi {{first_name}},</p><p>{{hr_order_change_notice}}</p><p><strong>Provider:</strong><br>{{provider_name}}</p><p><strong>Order:</strong><br>{{order_summary}}</p><p><strong>Total:</strong> {{order_total}}</p><p><a href="{{order_url}}">{{order_url}}</a></p>',
  body_text_template = 'Hi {{first_name}},

{{hr_order_change_notice}}

Provider:
{{provider_name}}

Order:
{{order_summary}}

Total: {{order_total}}

{{order_url}}'
where t.event_key = 'staff.changed_by_hr';
