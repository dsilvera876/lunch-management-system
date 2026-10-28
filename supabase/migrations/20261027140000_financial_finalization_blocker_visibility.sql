-- Bug #8 Phase A: authoritative financial-finalization blocker visibility.
-- Notification delivery is intentionally deferred to Phase B.

-- Financial-period finalization and every order write that can add or move a
-- blocker coordinate on the same lunch_periods row lock. Order DML acquires
-- its row lock first as part of INSERT/UPDATE, then this trigger locks matching
-- periods in UUID order. Finalization locks only its one period row before it
-- counts blockers, so the protocol has no period-to-order lock inversion.
--
-- Order writes also share-lock their lunch-day rows, so changing a lunch
-- day's order_date cannot move existing or concurrently inserted blockers
-- across period boundaries outside this protocol.
--
-- Once the period lock is acquired, status is checked again. If finalization
-- committed first, the order write fails. If the order write committed first,
-- finalization's later blocker count sees it and refuses to finalize.
create or replace function private.lock_financial_periods_for_order_dates(
  p_order_dates date[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period record;
begin
  for v_period in
    select lp.id, lp.status
    from public.lunch_periods lp
    where exists (
      select 1
      from pg_catalog.unnest(p_order_dates) requested(order_date)
      where requested.order_date is not null
        and requested.order_date between lp.start_date and lp.end_date
    )
    order by lp.id
    for update
  loop
    if v_period.status = 'finalized' then
      raise exception 'Orders in finalized lunch periods cannot be modified';
    end if;
  end loop;
end;
$$;

alter function private.lock_financial_periods_for_order_dates(date[]) owner to postgres;
revoke all on function private.lock_financial_periods_for_order_dates(date[])
  from public, anon, authenticated, service_role;

create or replace function private.guard_order_financial_period_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_order_date date;
  v_old_order_date date;
  v_old_lunch_day_id uuid;
  v_lunch_day record;
begin
  if tg_op = 'UPDATE' then
    v_old_lunch_day_id := old.lunch_day_id;
  end if;

  -- Lock both lunch days in a deterministic order before reading their dates.
  -- This prevents a concurrent date change from escaping the period lock.
  for v_lunch_day in
    select ld.id, ld.order_date
    from public.lunch_days ld
    where ld.id = new.lunch_day_id
       or (v_old_lunch_day_id is not null and ld.id = v_old_lunch_day_id)
    order by ld.id
    for share
  loop
    if v_lunch_day.id = new.lunch_day_id then
      v_new_order_date := v_lunch_day.order_date;
    end if;
    if v_lunch_day.id = v_old_lunch_day_id then
      v_old_order_date := v_lunch_day.order_date;
    end if;
  end loop;

  if v_new_order_date is null then
    raise exception 'Lunch day does not exist' using errcode = '23503';
  end if;

  perform private.lock_financial_periods_for_order_dates(
    array[v_new_order_date, v_old_order_date]
  );

  return new;
end;
$$;

alter function private.guard_order_financial_period_mutation() owner to postgres;
revoke all on function private.guard_order_financial_period_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_order_financial_period_mutation on public.orders;
create trigger guard_order_financial_period_mutation
before insert or update of lunch_day_id, status, delivery_state, financial_disposition
on public.orders
for each row
execute function private.guard_order_financial_period_mutation();

create or replace function private.guard_lunch_day_financial_period_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.order_date is not distinct from new.order_date then
    return new;
  end if;

  -- The lunch-day row lock conflicts with the order trigger's FOR SHARE lock,
  -- so this existence check cannot race a concurrent order insert.
  if exists (
    select 1
    from public.orders o
    where o.lunch_day_id = old.id
  ) then
    perform private.lock_financial_periods_for_order_dates(
      array[old.order_date, new.order_date]
    );
  end if;

  return new;
end;
$$;

alter function private.guard_lunch_day_financial_period_mutation() owner to postgres;
revoke all on function private.guard_lunch_day_financial_period_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_lunch_day_financial_period_mutation on public.lunch_days;
create trigger guard_lunch_day_financial_period_mutation
before update of order_date
on public.lunch_days
for each row
execute function private.guard_lunch_day_financial_period_mutation();

create or replace function private.list_lunch_period_finalization_blocker_ids(
  p_period_id uuid
)
returns table (
  order_id uuid,
  blocker_category text,
  pending_delivery boolean,
  open_issue boolean,
  financial_hold boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id as order_id,
    case
      when o.delivery_state = 'issue_open' then 'open_issue'
      when o.financial_disposition = 'on_hold' then 'financial_hold'
      else 'pending_delivery'
    end as blocker_category,
    o.delivery_state = 'pending' as pending_delivery,
    o.delivery_state = 'issue_open' as open_issue,
    o.financial_disposition = 'on_hold' as financial_hold
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

alter function private.list_lunch_period_finalization_blocker_ids(uuid) owner to postgres;
revoke all on function private.list_lunch_period_finalization_blocker_ids(uuid)
  from public, anon, authenticated, service_role;

-- Keep the public count and finalization RPC on exactly the same set of order IDs.
create or replace function private.count_unreconciled_delivery_orders(p_period_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from private.list_lunch_period_finalization_blocker_ids(p_period_id);
$$;

alter function private.count_unreconciled_delivery_orders(uuid) owner to postgres;
revoke all on function private.count_unreconciled_delivery_orders(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.count_unreconciled_delivery_orders(uuid) to authenticated;

create or replace function public.get_lunch_period_finalization_blockers(
  p_period_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not (
    private.can_view_accounts_operational_data()
    or private.can_view_hr_operational_data()
  ) then
    raise exception 'Financial finalization blocker access required'
      using errcode = '42501';
  end if;

  if p_period_id is null then
    raise exception 'Lunch period ID is required' using errcode = '22004';
  end if;

  if not exists (
    select 1 from public.lunch_periods lp where lp.id = p_period_id
  ) then
    raise exception 'Lunch period does not exist' using errcode = '22023';
  end if;

  with blocker_rows as (
    select
      b.order_id,
      b.blocker_category,
      b.pending_delivery,
      b.open_issue,
      b.financial_hold,
      coalesce(nullif(btrim(employee.full_name), ''), 'Unnamed employee') as employee_name,
      provider.name as provider_name,
      ld.order_date,
      ld.lunch_date as delivery_date,
      coalesce(nullif(btrim(o.office_location_name), ''), 'No delivery location')
        as office_location_name,
      o.status,
      o.delivery_state,
      o.financial_disposition,
      o.delivery_issue_type,
      o.delivery_resolution_type
    from private.list_lunch_period_finalization_blocker_ids(p_period_id) b
    join public.orders o on o.id = b.order_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    join public.lunch_providers provider on provider.id = ld.provider_id
    left join public.profiles employee on employee.id = o.profile_id
  ), period_row as (
    select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
    from public.lunch_periods lp
    where lp.id = p_period_id
  )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'id', period_row.id,
      'label', period_row.label,
      'start_date', period_row.start_date,
      'end_date', period_row.end_date,
      'status', period_row.status
    ),
    'counts', jsonb_build_object(
      'total', (select count(*) from blocker_rows),
      'pending_delivery', (
        select count(*) from blocker_rows where blocker_category = 'pending_delivery'
      ),
      'open_issue', (
        select count(*) from blocker_rows where blocker_category = 'open_issue'
      ),
      'financial_hold', (
        select count(*) from blocker_rows where blocker_category = 'financial_hold'
      )
    ),
    'blockers', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'order_id', r.order_id,
            'category', r.blocker_category,
            'reasons', jsonb_build_object(
              'pending_delivery', r.pending_delivery,
              'open_issue', r.open_issue,
              'financial_hold', r.financial_hold
            ),
            'employee_name', r.employee_name,
            'provider_name', r.provider_name,
            'order_date', r.order_date,
            'delivery_date', r.delivery_date,
            'office_location_name', r.office_location_name,
            'status', r.status,
            'delivery_state', r.delivery_state,
            'financial_disposition', r.financial_disposition,
            'delivery_issue_type', r.delivery_issue_type,
            'delivery_resolution_type', r.delivery_resolution_type
          )
          order by r.order_date, r.provider_name, r.employee_name, r.order_id
        )
        from blocker_rows r
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from period_row;

  return v_result;
end;
$$;

alter function public.get_lunch_period_finalization_blockers(uuid) owner to postgres;
revoke all on function public.get_lunch_period_finalization_blockers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_lunch_period_finalization_blockers(uuid)
  to authenticated;

create or replace function public.get_hr_lunch_period_finalization_blocker_orders(
  p_period_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.can_view_hr_operational_data() then
    raise exception 'HR operational order access is required'
      using errcode = '42501';
  end if;

  if p_period_id is null then
    raise exception 'Lunch period ID is required' using errcode = '22004';
  end if;

  if not exists (
    select 1 from public.lunch_periods lp where lp.id = p_period_id
  ) then
    raise exception 'Lunch period does not exist' using errcode = '22023';
  end if;

  with blocker_orders as (
    select
      b.blocker_category,
      b.pending_delivery,
      b.open_issue,
      b.financial_hold,
      o.id,
      o.profile_id,
      o.status,
      o.delivery_state,
      o.financial_disposition,
      o.delivery_issue_type,
      o.delivery_resolution_type,
      o.actual_delivery_date,
      o.lunch_day_id,
      o.created_at,
      o.updated_at,
      o.special_instructions,
      o.meal_quantity,
      o.is_late_order,
      o.office_location_name,
      o.office_location_address,
      coalesce(nullif(btrim(employee.full_name), ''), 'Unnamed employee') as employee_name,
      nullif(btrim(late_creator.full_name), '') as late_order_created_by_name,
      provider.id as provider_id,
      provider.name as provider_name,
      ld.order_date,
      ld.lunch_date as delivery_date,
      reconciliation.hr_delivery_notes,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', snapshot_item.id,
              'name', snapshot_item.name,
              'item_type', snapshot_item.item_type,
              'unit_label', snapshot_item.unit_label,
              'price', snapshot_item.price
            )
            order by snapshot_item.item_type, snapshot_item.name, snapshot_item.id
          )
          from public.menu_items snapshot_item
          where snapshot_item.lunch_day_id = o.lunch_day_id
            and snapshot_item.is_active = true
        ),
        '[]'::jsonb
      ) as snapshot_menu_items,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', mi.name,
              'quantity', oi.quantity,
              'item_type', mi.item_type,
              'unit_label', mi.unit_label,
              'display_category', mi.display_category
            )
            order by oi.created_at, oi.id
          )
          from public.order_items oi
          join public.menu_items mi on mi.id = oi.menu_item_id
          where oi.order_id = o.id
        ),
        '[]'::jsonb
      ) as items
    from private.list_lunch_period_finalization_blocker_ids(p_period_id) b
    join public.orders o on o.id = b.order_id
    join public.lunch_days ld on ld.id = o.lunch_day_id
    join public.lunch_providers provider on provider.id = ld.provider_id
    left join public.profiles employee on employee.id = o.profile_id
    left join public.profiles late_creator on late_creator.id = o.late_order_created_by
    left join public.order_delivery_reconciliation reconciliation
      on reconciliation.order_id = o.id
  ), period_row as (
    select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
    from public.lunch_periods lp
    where lp.id = p_period_id
  )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'id', period_row.id,
      'label', period_row.label,
      'start_date', period_row.start_date,
      'end_date', period_row.end_date,
      'status', period_row.status
    ),
    'orders', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'blocker_category', r.blocker_category,
            'blocker_reasons', jsonb_build_object(
              'pending_delivery', r.pending_delivery,
              'open_issue', r.open_issue,
              'financial_hold', r.financial_hold
            ),
            'id', r.id,
            'profile_id', r.profile_id,
            'status', r.status,
            'delivery_state', r.delivery_state,
            'financial_disposition', r.financial_disposition,
            'delivery_issue_type', r.delivery_issue_type,
            'delivery_resolution_type', r.delivery_resolution_type,
            'actual_delivery_date', r.actual_delivery_date,
            'lunch_day_id', r.lunch_day_id,
            'created_at', r.created_at,
            'updated_at', r.updated_at,
            'special_instructions', r.special_instructions,
            'meal_quantity', r.meal_quantity,
            'is_late_order', r.is_late_order,
            'office_location_name', coalesce(
              nullif(btrim(r.office_location_name), ''),
              'No delivery location'
            ),
            'office_location_address', r.office_location_address,
            'employee_name', r.employee_name,
            'late_order_created_by_name', r.late_order_created_by_name,
            'provider_id', r.provider_id,
            'provider_name', r.provider_name,
            'order_date', r.order_date,
            'delivery_date', r.delivery_date,
            'hr_delivery_notes', r.hr_delivery_notes,
            'snapshot_menu_items', r.snapshot_menu_items,
            'items', r.items
          )
          order by r.order_date, r.provider_name, r.employee_name, r.id
        )
        from blocker_orders r
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from period_row;

  return v_result;
end;
$$;

alter function public.get_hr_lunch_period_finalization_blocker_orders(uuid) owner to postgres;
revoke all on function public.get_hr_lunch_period_finalization_blocker_orders(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hr_lunch_period_finalization_blocker_orders(uuid)
  to authenticated;
