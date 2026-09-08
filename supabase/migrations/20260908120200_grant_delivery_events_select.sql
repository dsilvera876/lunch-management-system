-- Allow RLS policies on order_delivery_events to evaluate for authenticated users.
grant select on table public.order_delivery_events to authenticated;
