-- ============================================================
-- Decommission legacy manual lunch days (provider_id IS NULL)
-- Modern ordering uses provider-linked lunch_days snapshots only.
-- ============================================================

delete from public.orders o
using public.lunch_days ld
where o.lunch_day_id = ld.id
  and ld.provider_id is null;

delete from public.menu_items mi
using public.lunch_days ld
where mi.lunch_day_id = ld.id
  and ld.provider_id is null;

delete from public.lunch_days ld
where ld.provider_id is null;

drop index if exists public.lunch_days_legacy_date_unique;

alter table public.lunch_days
  alter column provider_id set not null;
