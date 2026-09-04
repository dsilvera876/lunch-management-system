-- ============================================================
-- Development seed data
-- ============================================================

insert into public.lunch_days (
  id,
  lunch_date,
  order_deadline,
  status,
  notes
)
values
(
  '10000000-0000-0000-0000-000000000001',
  current_date + 1,
  current_date + interval '1 day' + time '10:00',
  'open',
  'Development lunch day'
);

insert into public.menu_items (
  id,
  lunch_day_id,
  name,
  description,
  price,
  is_active
)
values
(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Jerk Chicken',
  'Jerk chicken with rice and peas',
  12.00,
  true
),
(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Curry Chicken',
  'Curry chicken with white rice',
  11.00,
  true
),
(
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Vegetarian Bowl',
  'Seasoned vegetables with rice and beans',
  9.50,
  true
);