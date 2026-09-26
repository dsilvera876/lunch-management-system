-- Provider-linked lunch day snapshot for pgTAP submit_order / order tests.
-- Replaces legacy manual lunch days (provider_id IS NULL).

reset role;

insert into public.lunch_providers (id, name, active)
values (
  '90000000-0000-0000-0000-000000000099',
  'Submit Order Test Provider',
  true
)
on conflict (id) do update
set active = excluded.active;

insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status,
  notes
)
values (
  '10000000-0000-0000-0000-000000000001',
  public.delivery_date_for_order_date('2099-01-01'::date),
  '2099-01-01'::date,
  '90000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-01'::date),
  'open',
  'Provider snapshot lunch day test fixture'
)
on conflict (id) do update
set
  status = excluded.status,
  order_deadline = excluded.order_deadline,
  provider_id = excluded.provider_id,
  order_date = excluded.order_date,
  lunch_date = excluded.lunch_date;

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
  price = excluded.price,
  lunch_day_id = excluded.lunch_day_id;

\ir office_location_fixture.inc
