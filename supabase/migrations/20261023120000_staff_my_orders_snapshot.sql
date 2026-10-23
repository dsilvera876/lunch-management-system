-- Return the signed-in employee's complete My Orders context from one SQL
-- statement snapshot. A single JSON value avoids PostgREST row limits without
-- exposing a caller-controlled profile identifier.

begin;

create function public.get_my_orders_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with caller as materialized (
    select p.id
    from public.profiles p
    where p.id = (select private.current_user_id())
      and p.account_status = 'active'
  ),
  snapshot_context as materialized (
    select
      c.id as profile_id,
      s.daily_lunch_subsidy,
      statement_timestamp() as snapshot_at,
      (statement_timestamp() at time zone 'America/Jamaica')::date as jamaica_today
    from caller c
    join public.app_settings s on s.id = 1
  ),
  employee_orders as materialized (
    select
      o.id,
      o.lunch_day_id,
      o.order_group_id,
      o.is_late_order,
      o.status,
      o.created_at,
      o.updated_at,
      o.delivery_state,
      o.financial_disposition,
      o.special_instructions,
      o.meal_quantity,
      o.office_location_id,
      o.office_location_name,
      ld.status as lunch_day_status,
      ld.lunch_date,
      ld.order_date,
      ld.order_deadline,
      lp.id as provider_id,
      lp.name as provider_name,
      lp.ratings_enabled,
      lp.active as provider_active,
      sc.snapshot_at,
      sc.jamaica_today,
      sc.daily_lunch_subsidy
    from snapshot_context sc
    join public.orders o on o.profile_id = sc.profile_id
    left join public.lunch_days ld on ld.id = o.lunch_day_id
    left join public.lunch_providers lp on lp.id = ld.provider_id
    where o.order_group_id is not null
       or o.is_late_order = true
  ),
  order_dates as materialized (
    select distinct eo.order_date
    from employee_orders eo
    where eo.order_date is not null
  ),
  subsidy_context as materialized (
    select
      od.order_date,
      count(period.id)::integer as matching_period_count,
      case
        when count(period.id) = 0 then max(sc.daily_lunch_subsidy)
        when count(period.id) = 1 and max(period.status) = 'open'
          then max(sc.daily_lunch_subsidy)
        when count(period.id) = 1 and max(period.status) = 'finalized'
          then max(period.finalized_daily_subsidy)
        else null
      end::numeric(12, 2) as effective_daily_subsidy,
      case
        when count(period.id) = 0 then true
        when count(period.id) = 1 and max(period.status) = 'open' then true
        when count(period.id) = 1
          and max(period.status) = 'finalized'
          and max(period.finalized_daily_subsidy) is not null
          and max(period.finalized_daily_subsidy) >= 0 then true
        else false
      end as valid
    from order_dates od
    cross join snapshot_context sc
    left join public.lunch_periods period
      on od.order_date between period.start_date and period.end_date
    group by od.order_date
  ),
  group_context as materialized (
    select
      coalesce(eo.order_group_id, eo.id) as checkout_id,
      count(*) filter (
        where eo.lunch_date is null or eo.order_date is null
      ) = 0
      and count(distinct eo.lunch_date) = 1
      and count(distinct eo.order_date) = 1 as valid
    from employee_orders eo
    group by coalesce(eo.order_group_id, eo.id)
  ),
  item_context as materialized (
    select
      eo.id as order_id,
      count(oi.id) > 0
        and coalesce(bool_and(oi.quantity > 0 and oi.unit_price >= 0), false) as valid,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'menu_items', jsonb_build_object(
              'name', mi.name,
              'item_type', mi.item_type,
              'unit_label', mi.unit_label,
              'provider_menu_item_id', mi.provider_menu_item_id
            )
          )
          order by oi.created_at, oi.id
        ) filter (where oi.id is not null and mi.id is not null),
        '[]'::jsonb
      ) as order_items
    from employee_orders eo
    left join public.order_items oi on oi.order_id = eo.id
    left join public.menu_items mi on mi.id = oi.menu_item_id
    group by eo.id
  ),
  order_context as materialized (
    select
      eo.*,
      sc.effective_daily_subsidy,
      sc.valid as subsidy_valid,
      gc.valid as checkout_valid,
      ic.valid as items_valid,
      ic.order_items,
      delivery.delivered_at,
      deadline.effective_order_deadline,
      ordering.is_open,
      ordering.is_business_day,
      ordering.period_finalized
    from employee_orders eo
    left join subsidy_context sc on sc.order_date = eo.order_date
    left join group_context gc
      on gc.checkout_id = coalesce(eo.order_group_id, eo.id)
    left join item_context ic on ic.order_id = eo.id
    left join lateral (
      select max(event.created_at) as delivered_at
      from public.order_delivery_events event
      where event.order_id = eo.id
        and event.event_type = 'marked_delivered'
    ) delivery on true
    left join lateral (
      select public.effective_order_deadline(eo.lunch_day_id) as effective_order_deadline
      where eo.status = 'submitted'
        and not eo.is_late_order
        and eo.lunch_day_status = 'open'
        and eo.provider_active = true
        and eo.lunch_date >= eo.jamaica_today
    ) deadline on true
    left join lateral (
      select state.is_open, state.is_business_day, state.period_finalized
      from public.get_self_service_ordering_state(
        eo.order_date,
        eo.office_location_id,
        eo.snapshot_at
      ) state
      where eo.status = 'submitted'
        and not eo.is_late_order
        and eo.lunch_day_status = 'open'
        and eo.provider_active = true
        and eo.lunch_date >= eo.jamaica_today
    ) ordering on true
  ),
  validated as materialized (
    select coalesce(
      bool_and(
        oc.lunch_day_status is not null
        and oc.lunch_date is not null
        and oc.order_date is not null
        and oc.provider_id is not null
        and oc.provider_name is not null
        and oc.subsidy_valid = true
        and oc.effective_daily_subsidy is not null
        and oc.effective_daily_subsidy >= 0
        and oc.checkout_valid = true
        and oc.items_valid = true
      ),
      true
    ) as financial_context_valid
    from order_context oc
  )
  select jsonb_build_object(
    'snapshot_version', 1,
    'snapshot_at', sc.snapshot_at,
    'jamaica_today', sc.jamaica_today,
    'financial_context_valid', validated.financial_context_valid,
    'daily_subsidies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'order_date', subsidy.order_date,
            'effective_daily_subsidy', subsidy.effective_daily_subsidy
          )
          order by subsidy.order_date
        )
        from subsidy_context subsidy
      ),
      '[]'::jsonb
    ),
    'orders', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oc.id,
            'lunch_day_id', oc.lunch_day_id,
            'order_group_id', oc.order_group_id,
            'is_late_order', oc.is_late_order,
            'status', oc.status,
            'created_at', oc.created_at,
            'updated_at', oc.updated_at,
            'delivery_state', oc.delivery_state,
            'financial_disposition', oc.financial_disposition,
            'special_instructions', oc.special_instructions,
            'meal_quantity', oc.meal_quantity,
            'office_location_id', oc.office_location_id,
            'office_location_name', oc.office_location_name,
            'lunch_days', jsonb_build_object(
              'status', oc.lunch_day_status,
              'lunch_date', oc.lunch_date,
              'order_date', oc.order_date,
              'order_deadline', oc.order_deadline,
              'lunch_providers', jsonb_build_object(
                'id', oc.provider_id,
                'name', oc.provider_name,
                'ratings_enabled', oc.ratings_enabled,
                'active', oc.provider_active
              )
            ),
            'order_items', oc.order_items,
            'delivered_at', oc.delivered_at,
            'effective_order_deadline', oc.effective_order_deadline,
            'ordering_state', case
              when oc.is_open is null
                or oc.is_business_day is null
                or oc.period_finalized is null then null
              else jsonb_build_object(
                'is_open', oc.is_open,
                'is_business_day', oc.is_business_day,
                'period_finalized', oc.period_finalized
              )
            end
          )
          order by oc.created_at desc, oc.id desc
        )
        from order_context oc
      ),
      '[]'::jsonb
    )
  )
  from snapshot_context sc
  cross join validated;
$$;

alter function public.get_my_orders_snapshot() owner to postgres;
revoke all on function public.get_my_orders_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_orders_snapshot()
  to postgres, authenticated;

commit;
