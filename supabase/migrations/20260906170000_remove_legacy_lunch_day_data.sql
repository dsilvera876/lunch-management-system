-- ============================================================
-- Remove legacy manual lunch-day development data (Batch 2B)
-- Financial reporting uses provider-based cycles only.
-- ============================================================

-- ------------------------------------------------------------
-- Identification rule (narrow, explicit):
--   lunch_days.provider_id IS NULL
--   AND lunch_days.order_date IS NULL
-- These rows are pre-provider manual lunch days from early dev/seed.
-- Provider-generated cycles always have both columns set.
-- ------------------------------------------------------------

-- Orders reference lunch_days with ON DELETE RESTRICT — delete orders first.
-- order_items cascade when orders are deleted.

delete from public.orders o
using public.lunch_days ld
where o.lunch_day_id = ld.id
  and ld.provider_id is null
  and ld.order_date is null;

delete from public.menu_items mi
using public.lunch_days ld
where mi.lunch_day_id = ld.id
  and ld.provider_id is null
  and ld.order_date is null;

delete from public.lunch_days ld
where ld.provider_id is null
  and ld.order_date is null;


-- ------------------------------------------------------------
-- Financial summaries: provider-based orders only
-- ------------------------------------------------------------

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
  order_total numeric
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
    coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(12, 2)
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  join public.order_items oi on oi.order_id = o.id
  join public.profiles pr on pr.id = o.profile_id
  join auth.users au on au.id = pr.id
  join public.lunch_providers lpr on lpr.id = ld.provider_id
  where o.status in ('submitted', 'fulfilled')
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
    o.status;
$$;

revoke all on function private.qualifying_financial_orders(uuid, date, date, uuid) from public;
