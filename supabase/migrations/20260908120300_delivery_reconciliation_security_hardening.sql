-- Security hardening: pending finalization blocking, restricted HR notes storage,
-- reconciliation-only audit visibility.

-- ------------------------------------------------------------
-- HR delivery notes: move off orders (Staff SELECT on orders)
-- ------------------------------------------------------------

create table if not exists public.order_delivery_reconciliation (
  order_id uuid primary key references public.orders(id) on delete restrict,
  hr_delivery_notes text
    check (hr_delivery_notes is null or char_length(hr_delivery_notes) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.order_delivery_reconciliation enable row level security;
alter table public.order_delivery_reconciliation force row level security;

revoke all on table public.order_delivery_reconciliation from public, anon, authenticated;
grant select on table public.order_delivery_reconciliation to authenticated;

create policy "Reconciliation roles can view HR delivery notes"
  on public.order_delivery_reconciliation
  for select
  to authenticated
  using ((select private.can_reconcile_deliveries()));

insert into public.order_delivery_reconciliation (order_id, hr_delivery_notes)
select id, hr_delivery_notes
from public.orders
where hr_delivery_notes is not null
on conflict (order_id) do update
set hr_delivery_notes = excluded.hr_delivery_notes;

alter table public.orders drop column if exists hr_delivery_notes;

create or replace function private.get_order_hr_delivery_notes(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select hr_delivery_notes
  from public.order_delivery_reconciliation
  where order_id = p_order_id;
$$;

revoke all on function private.get_order_hr_delivery_notes(uuid) from public;

create or replace function private.set_order_hr_delivery_notes(p_order_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_delivery_reconciliation (order_id, hr_delivery_notes, updated_by)
  values (
    p_order_id,
    p_notes,
    (select private.current_user_id())
  )
  on conflict (order_id) do update
  set
    hr_delivery_notes = excluded.hr_delivery_notes,
    updated_at = now(),
    updated_by = excluded.updated_by;
end;
$$;

revoke all on function private.set_order_hr_delivery_notes(uuid, text) from public;

create or replace function private.merge_order_hr_delivery_notes(p_order_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notes is null then
    return;
  end if;

  insert into public.order_delivery_reconciliation (order_id, hr_delivery_notes, updated_by)
  values (
    p_order_id,
    p_notes,
    (select private.current_user_id())
  )
  on conflict (order_id) do update
  set
    hr_delivery_notes = coalesce(excluded.hr_delivery_notes, public.order_delivery_reconciliation.hr_delivery_notes),
    updated_at = now(),
    updated_by = excluded.updated_by;
end;
$$;

revoke all on function private.merge_order_hr_delivery_notes(uuid, text) from public;

-- ------------------------------------------------------------
-- Audit events: HR/Admin/Owner only (not Staff or Accounts)
-- ------------------------------------------------------------

drop policy if exists "Authorized roles can view delivery events for visible orders"
  on public.order_delivery_events;

create policy "Reconciliation roles can view delivery audit events"
  on public.order_delivery_events
  for select
  to authenticated
  using ((select private.can_reconcile_deliveries()));

-- ------------------------------------------------------------
-- Finalization: block unreconciled orders (pending + open issues)
-- ------------------------------------------------------------

create or replace function private.count_unreconciled_delivery_orders(p_period_id uuid)
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
      o.delivery_state = 'pending'
      or o.delivery_state = 'issue_open'
      or o.financial_disposition = 'on_hold'
    );
$$;

revoke all on function private.count_unreconciled_delivery_orders(uuid) from public;
grant execute on function private.count_unreconciled_delivery_orders(uuid) to authenticated;

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

  return private.count_unreconciled_delivery_orders(p_period_id);
end;
$$;

-- ------------------------------------------------------------
-- RPC updates: HR notes via restricted table
-- ------------------------------------------------------------

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
    delivery_resolution_type = p_resolution_type
  where id = p_order_id;

  perform private.merge_order_hr_delivery_notes(p_order_id, v_notes);

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
    financial_disposition = 'on_hold'
  where id = p_order_id;

  if v_notes is not null then
    perform private.set_order_hr_delivery_notes(p_order_id, v_notes);
  end if;

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

  perform private.set_order_hr_delivery_notes(p_order_id, v_notes);

  perform private.append_order_delivery_event(
    p_order_id,
    'hr_notes_updated',
    jsonb_build_object('hr_notes', v_notes)
  );
end;
$$;

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
    delivery_resolution_type = coalesce(delivery_resolution_type, 'no_replacement_no_charge')
  where id = p_order_id;

  if v_notes is not null then
    perform private.set_order_hr_delivery_notes(p_order_id, v_notes);
  end if;

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

create or replace function public.finalize_lunch_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_subsidy numeric;
  v_unreconciled bigint;
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

  v_unreconciled := private.count_unreconciled_delivery_orders(p_period_id);

  if v_unreconciled > 0 then
    raise exception
      'This lunch period cannot be finalized because % order(s) still require delivery reconciliation.',
      v_unreconciled;
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
