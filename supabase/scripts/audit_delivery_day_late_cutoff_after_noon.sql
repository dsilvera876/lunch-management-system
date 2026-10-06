-- Read-only staging/production audit:
-- Providers whose stored delivery-day late-order cutoff is after 12:00 PM.
-- Runtime enforcement caps effective deadlines at noon; HR should correct stored values.

select
  id,
  name,
  late_order_deadline_day,
  late_order_deadline_time,
  active,
  accepts_late_orders
from public.lunch_providers
where accepts_late_orders = true
  and late_order_deadline_day = 'delivery_day'
  and late_order_deadline_time > time '12:00:00'
order by name;
