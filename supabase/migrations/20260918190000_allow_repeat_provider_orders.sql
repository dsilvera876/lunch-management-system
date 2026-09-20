-- Allow multiple submitted orders per user per provider lunch day.
-- Uniqueness is enforced only within a single checkout payload (see submit_provider_checkout).

alter table public.orders
  drop constraint if exists one_order_per_user_per_lunch_day;

drop index if exists public.one_active_order_per_user_per_lunch_day;

comment on column public.orders.order_group_id is
  'Links provider orders submitted together in one staff checkout. Null for legacy rows or direct submit_provider_order calls without grouping. Multiple orders may share the same lunch_day_id across separate checkouts.';
