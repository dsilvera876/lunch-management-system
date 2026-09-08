-- Delivery reconciliation: operational delivery state, financial disposition,
-- issue/resolution workflow, audit history, and financial integration.

-- ------------------------------------------------------------
-- Order reconciliation columns
-- ------------------------------------------------------------

alter table public.orders
  add column if not exists delivery_state text not null default 'pending'
    check (delivery_state in ('pending', 'delivered', 'issue_open', 'resolved')),
  add column if not exists financial_disposition text not null default 'chargeable'
    check (financial_disposition in ('chargeable', 'on_hold', 'waived')),
  add column if not exists delivery_issue_type text
    check (
      delivery_issue_type is null
      or delivery_issue_type in (
        'not_delivered',
        'wrong_order',
        'damaged',
        'provider_cancelled',
        'other'
      )
    ),
  add column if not exists delivery_resolution_type text
    check (
      delivery_resolution_type is null
      or delivery_resolution_type in (
        'deliver_later_today',
        'deliver_next_business_day',
        'send_correct_later_today',
        'send_correct_next_business_day',
        'replacement_later_today',
        'replacement_next_business_day',
        'substitute_accepted',
        'no_replacement_no_charge',
        'other'
      )
    ),
  add column if not exists hr_delivery_notes text
    check (hr_delivery_notes is null or char_length(hr_delivery_notes) <= 1000),
  add column if not exists actual_delivery_date date;

-- ------------------------------------------------------------
-- Backfill existing orders
-- ------------------------------------------------------------

update public.orders
set
  delivery_state = case
    when status = 'cancelled' then 'resolved'
    when status = 'fulfilled' then 'delivered'
    else 'pending'
  end,
  financial_disposition = case
    when status = 'cancelled' then 'waived'
    else 'chargeable'
  end,
  actual_delivery_date = case
    when status = 'fulfilled' then (
      select ld.lunch_date
      from public.lunch_days ld
      where ld.id = orders.lunch_day_id
    )
    else null
  end
where delivery_state = 'pending'
  and financial_disposition = 'chargeable';

-- ------------------------------------------------------------
-- Append-only delivery audit events
-- ------------------------------------------------------------

create table if not exists public.order_delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null
    check (event_type in (
      'marked_delivered',
      'issue_reported',
      'resolution_updated',
      'hr_notes_updated',
      'order_adjusted',
      'replacement_delivered',
      'charge_waived'
    )),
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_delivery_events_order_id_idx
  on public.order_delivery_events (order_id, created_at desc);

alter table public.order_delivery_events enable row level security;
alter table public.order_delivery_events force row level security;

revoke all on table public.order_delivery_events from public, anon, authenticated;
grant select on table public.order_delivery_events to authenticated;

create policy "Authorized roles can view delivery events for visible orders"
  on public.order_delivery_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_delivery_events.order_id
        and (
          o.profile_id = (select private.current_user_id())
          or (select private.can_view_all_orders())
        )
    )
  );

-- ------------------------------------------------------------
-- Reconciliation helpers
-- ------------------------------------------------------------

create or replace function private.can_reconcile_deliveries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'admin', 'owner']);
$$;

revoke all on function private.can_reconcile_deliveries() from public;
grant execute on function private.can_reconcile_deliveries() to authenticated;

create or replace function private.normalize_hr_delivery_notes(p_notes text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_trimmed text;
begin
  v_trimmed := nullif(trim(coalesce(p_notes, '')), '');

  if v_trimmed is not null and char_length(v_trimmed) > 1000 then
    raise exception 'HR delivery notes are too long';
  end if;

  return v_trimmed;
end;
$$;

revoke all on function private.normalize_hr_delivery_notes(text) from public;

create or replace function private.assert_valid_delivery_issue_type(p_issue_type text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_issue_type not in (
    'not_delivered',
    'wrong_order',
    'damaged',
    'provider_cancelled',
    'other'
  ) then
    raise exception 'Invalid delivery issue type';
  end if;
end;
$$;

revoke all on function private.assert_valid_delivery_issue_type(text) from public;

create or replace function private.assert_valid_delivery_resolution_type(p_resolution_type text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_resolution_type not in (
    'deliver_later_today',
    'deliver_next_business_day',
    'send_correct_later_today',
    'send_correct_next_business_day',
    'replacement_later_today',
    'replacement_next_business_day',
    'substitute_accepted',
    'no_replacement_no_charge',
    'other'
  ) then
    raise exception 'Invalid delivery resolution type';
  end if;
end;
$$;

revoke all on function private.assert_valid_delivery_resolution_type(text) from public;

create or replace function private.assert_order_reconciliation_mutable(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);

  return v_order;
end;
$$;

revoke all on function private.assert_order_reconciliation_mutable(uuid) from public;

create or replace function private.order_items_audit_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'menu_item_id', oi.menu_item_id,
      'name', mi.name,
      'item_type', mi.item_type,
      'unit_label', mi.unit_label,
      'display_category', mi.display_category,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price
    )
    order by mi.name
  ), '[]'::jsonb)
  from public.order_items oi
  join public.menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = p_order_id;
$$;

revoke all on function private.order_items_audit_snapshot(uuid) from public;

create or replace function private.append_order_delivery_event(
  p_order_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_delivery_events (
    order_id,
    event_type,
    actor_id,
    payload
  )
  values (
    p_order_id,
    p_event_type,
    (select private.current_user_id()),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.append_order_delivery_event(uuid, text, jsonb) from public;

create or replace function private.count_unresolved_delivery_issues(p_period_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  join public.lunch_periods lp on lp.id = p_period_id
  where o.status <> 'cancelled'
    and ld.order_date between lp.start_date and lp.end_date
    and (
      o.delivery_state = 'issue_open'
      or o.financial_disposition = 'on_hold'
    );
$$;

revoke all on function private.count_unresolved_delivery_issues(uuid) from public;
grant execute on function private.count_unresolved_delivery_issues(uuid) to authenticated;

create or replace function public.get_lunch_period_unresolved_delivery_issue_count(p_period_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_finalize_lunch_periods()) then
    raise exception 'Lunch period finalization access required';
  end if;

  if not exists (
    select 1 from public.lunch_periods where id = p_period_id
  ) then
    raise exception 'Lunch period does not exist';
  end if;

  return private.count_unresolved_delivery_issues(p_period_id);
end;
$$;

revoke execute on function public.get_lunch_period_unresolved_delivery_issue_count(uuid) from public, anon;
grant execute on function public.get_lunch_period_unresolved_delivery_issue_count(uuid) to authenticated;

-- ------------------------------------------------------------
-- Reconciliation RPCs
-- ------------------------------------------------------------

create or replace function public.mark_order_delivered(
  p_order_id uuid,
  p_actual_delivery_date date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_actual_date date;
  v_prior_total numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be marked delivered';
  end if;

  if v_order.delivery_state <> 'pending' then
    raise exception 'Only pending deliveries can be marked delivered';
  end if;

  v_actual_date := coalesce(p_actual_delivery_date, public.jamaica_today_date());
  v_prior_total := public.calculate_order_total(p_order_id);

  update public.orders
  set
    delivery_state = 'delivered',
    financial_disposition = 'chargeable',
    actual_delivery_date = v_actual_date,
    status = 'fulfilled',
    delivery_issue_type = null,
    delivery_resolution_type = null
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'marked_delivered',
    jsonb_build_object(
      'actual_delivery_date', v_actual_date,
      'order_total', v_prior_total,
      'items', private.order_items_audit_snapshot(p_order_id)
    )
  );
end;
$$;

revoke execute on function public.mark_order_delivered(uuid, date) from public, anon;
grant execute on function public.mark_order_delivered(uuid, date) to authenticated;

create or replace function public.report_order_delivery_issue(
  p_order_id uuid,
  p_issue_type text,
  p_hr_notes text default null,
  p_resolution_type text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_notes text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  perform private.assert_valid_delivery_issue_type(p_issue_type);

  if p_resolution_type is not null then
    perform private.assert_valid_delivery_resolution_type(p_resolution_type);
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot receive delivery issues';
  end if;

  v_notes := private.normalize_hr_delivery_notes(p_hr_notes);

  update public.orders
  set
    delivery_state = 'issue_open',
    financial_disposition = 'on_hold',
    delivery_issue_type = p_issue_type,
    delivery_resolution_type = p_resolution_type,
    hr_delivery_notes = coalesce(v_notes, hr_delivery_notes)
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'issue_reported',
    jsonb_build_object(
      'issue_type', p_issue_type,
      'resolution_type', p_resolution_type,
      'hr_notes', v_notes,
      'prior_delivery_state', v_order.delivery_state,
      'prior_financial_disposition', v_order.financial_disposition
    )
  );
end;
$$;

revoke execute on function public.report_order_delivery_issue(uuid, text, text, text) from public, anon;
grant execute on function public.report_order_delivery_issue(uuid, text, text, text) to authenticated;

create or replace function public.update_order_delivery_resolution(
  p_order_id uuid,
  p_resolution_type text,
  p_hr_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_notes text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  perform private.assert_valid_delivery_resolution_type(p_resolution_type);

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.delivery_state <> 'issue_open' then
    raise exception 'Only open delivery issues can be updated';
  end if;

  v_notes := private.normalize_hr_delivery_notes(p_hr_notes);

  update public.orders
  set
    delivery_resolution_type = p_resolution_type,
    hr_delivery_notes = case
      when v_notes is not null then v_notes
      else hr_delivery_notes
    end,
    financial_disposition = 'on_hold'
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'resolution_updated',
    jsonb_build_object(
      'resolution_type', p_resolution_type,
      'hr_notes', v_notes
    )
  );
end;
$$;

revoke execute on function public.update_order_delivery_resolution(uuid, text, text) from public, anon;
grant execute on function public.update_order_delivery_resolution(uuid, text, text) to authenticated;

create or replace function public.update_order_hr_delivery_notes(
  p_order_id uuid,
  p_hr_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_notes text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be updated';
  end if;

  v_notes := private.normalize_hr_delivery_notes(p_hr_notes);

  update public.orders
  set hr_delivery_notes = v_notes
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'hr_notes_updated',
    jsonb_build_object('hr_notes', v_notes)
  );
end;
$$;

revoke execute on function public.update_order_hr_delivery_notes(uuid, text) from public, anon;
grant execute on function public.update_order_hr_delivery_notes(uuid, text) to authenticated;

create or replace function public.confirm_order_delivery_resolved(
  p_order_id uuid,
  p_actual_delivery_date date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_actual_date date;
  v_prior_total numeric;
  v_new_total numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.delivery_state <> 'issue_open' then
    raise exception 'Only open delivery issues can be confirmed resolved';
  end if;

  v_actual_date := coalesce(p_actual_delivery_date, public.jamaica_today_date());
  v_prior_total := public.calculate_order_total(p_order_id);

  update public.orders
  set
    delivery_state = 'resolved',
    financial_disposition = 'chargeable',
    actual_delivery_date = v_actual_date,
    status = 'fulfilled'
  where id = p_order_id;

  v_new_total := public.calculate_order_total(p_order_id);

  perform private.append_order_delivery_event(
    p_order_id,
    'replacement_delivered',
    jsonb_build_object(
      'actual_delivery_date', v_actual_date,
      'prior_total', v_prior_total,
      'new_total', v_new_total,
      'items', private.order_items_audit_snapshot(p_order_id)
    )
  );
end;
$$;

revoke execute on function public.confirm_order_delivery_resolved(uuid, date) from public, anon;
grant execute on function public.confirm_order_delivery_resolved(uuid, date) to authenticated;

create or replace function public.resolve_order_no_charge(
  p_order_id uuid,
  p_hr_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_notes text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_reconcile_deliveries()) then
    raise exception 'Delivery reconciliation access required';
  end if;

  v_order := private.assert_order_reconciliation_mutable(p_order_id);

  if v_order.delivery_state <> 'issue_open' then
    raise exception 'Only open delivery issues can be resolved with no charge';
  end if;

  v_notes := private.normalize_hr_delivery_notes(p_hr_notes);

  update public.orders
  set
    delivery_state = 'resolved',
    financial_disposition = 'waived',
    delivery_resolution_type = coalesce(delivery_resolution_type, 'no_replacement_no_charge'),
    hr_delivery_notes = coalesce(v_notes, hr_delivery_notes)
  where id = p_order_id;

  perform private.append_order_delivery_event(
    p_order_id,
    'charge_waived',
    jsonb_build_object(
      'hr_notes', v_notes,
      'prior_total', public.calculate_order_total(p_order_id)
    )
  );
end;
$$;

revoke execute on function public.resolve_order_no_charge(uuid, text) from public, anon;
grant execute on function public.resolve_order_no_charge(uuid, text) to authenticated;

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
end;
$$;

revoke execute on function public.adjust_operational_order_items(uuid, jsonb, text) from public, anon;
grant execute on function public.adjust_operational_order_items(uuid, jsonb, text) to authenticated;

-- Keep fulfill_order as a compatibility wrapper with legacy error semantics.
create or replace function public.fulfill_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_fulfill_orders()) then
    raise exception 'Fulfillment access required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_order.status <> 'submitted' then
    raise exception 'Only submitted orders can be fulfilled';
  end if;

  perform public.mark_order_delivered(p_order_id, null);
end;
$$;

-- ------------------------------------------------------------
-- Financial qualification uses financial_disposition
-- ------------------------------------------------------------

drop function if exists private.qualifying_financial_orders(uuid, date, date, uuid);

create or replace function private.qualifying_financial_orders(
  p_profile_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_period_id uuid default null
)
returns table (
  order_id uuid,
  profile_id uuid,
  employee_name text,
  employee_email text,
  order_date date,
  delivery_date date,
  provider_name text,
  order_status text,
  order_total numeric,
  office_location_name text,
  office_location_address text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.profile_id,
    pr.full_name,
    au.email::text,
    ld.order_date,
    ld.lunch_date,
    lpr.name,
    o.status,
    coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(12, 2),
    o.office_location_name,
    o.office_location_address
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  join public.order_items oi on oi.order_id = o.id
  join public.profiles pr on pr.id = o.profile_id
  join auth.users au on au.id = pr.id
  join public.lunch_providers lpr on lpr.id = ld.provider_id
  where o.status in ('submitted', 'fulfilled')
    and o.financial_disposition = 'chargeable'
    and ld.provider_id is not null
    and ld.order_date is not null
    and (p_profile_id is null or o.profile_id = p_profile_id)
    and (p_start_date is null or ld.order_date >= p_start_date)
    and (p_end_date is null or ld.order_date <= p_end_date)
    and (
      p_period_id is null
      or exists (
        select 1
        from public.lunch_periods lper
        where lper.id = p_period_id
          and ld.order_date between lper.start_date and lper.end_date
      )
    )
  group by
    o.id,
    o.profile_id,
    pr.full_name,
    au.email,
    ld.order_date,
    ld.lunch_date,
    lpr.name,
    o.status,
    o.office_location_name,
    o.office_location_address;
$$;

-- ------------------------------------------------------------
-- Block finalization when delivery issues remain unresolved
-- ------------------------------------------------------------

create or replace function public.finalize_lunch_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_subsidy numeric;
  v_unresolved bigint;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_finalize_lunch_periods()) then
    raise exception 'Lunch period finalization access required';
  end if;

  if not exists (
    select 1
    from public.lunch_periods
    where id = p_period_id
  ) then
    raise exception 'Lunch period does not exist';
  end if;

  v_unresolved := private.count_unresolved_delivery_issues(p_period_id);

  if v_unresolved > 0 then
    raise exception
      'This lunch period cannot be finalized because % delivery issue(s) are still unresolved.',
      v_unresolved;
  end if;

  v_current_subsidy := public.get_daily_lunch_subsidy();

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    status = 'finalized',
    finalized_daily_subsidy = v_current_subsidy,
    updated_by = (select private.current_user_id())
  where id = p_period_id
    and status = 'open';

  if not found then
    raise exception 'Only open lunch periods can be finalized';
  end if;

  perform set_config('app.allow_lunch_period_write', '', true);
end;
$$;

revoke execute on function public.finalize_lunch_period(uuid) from public, anon;
grant execute on function public.finalize_lunch_period(uuid) to authenticated;
