-- Legacy manual lunch day fixture for pgTAP tests only (not deployed).
-- Included via \ir from tests that exercise legacy submit_order workflows.

reset role;

insert into public.lunch_days (
  id,
  lunch_date,
  order_deadline,
  status,
  notes
)
values (
  '10000000-0000-0000-0000-000000000001',
  current_date + 1,
  now() + interval '1 day',
  'open',
  'Legacy dev/test lunch day fixture'
)
on conflict (id) do update
set
  status = excluded.status,
  order_deadline = excluded.order_deadline;

insert into public.menu_items (
  id,
  lunch_day_id,
  name,
  description,
  price,
  item_type,
  unit_label,
  is_active
)
values
(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Jerk Chicken',
  'Jerk chicken with rice and peas',
  12.00,
  'standalone',
  'Each',
  true
),
(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Curry Chicken',
  'Curry chicken with white rice',
  11.00,
  'standalone',
  'Each',
  true
),
(
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Vegetarian Bowl',
  'Seasoned vegetables with rice and beans',
  9.50,
  'standalone',
  'Each',
  true
)
on conflict (id) do update
set
  is_active = true,
  price = excluded.price;
