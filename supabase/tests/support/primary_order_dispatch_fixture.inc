-- Deterministic primary-order dispatch fixture (2020-06-01 order date).
reset role;

select set_config('test.primary_order_date', '2020-06-01', false);
select set_config(
  'test.primary_delivery_date',
  public.delivery_date_for_order_date('2020-06-01'::date)::text,
  false
);

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values
  (
    'f0d11111-1111-4111-8111-111111111111',
    current_setting('test.primary_delivery_date')::date,
    current_setting('test.primary_order_date')::date,
    'f9111111-1111-4111-8111-111111111111',
    public.order_deadline_for_order_date('2020-06-01'::date),
    'open'
  ),
  (
    'f0d22222-2222-4222-8222-222222222222',
    current_setting('test.primary_delivery_date')::date,
    current_setting('test.primary_order_date')::date,
    'f9222222-2222-4222-8222-222222222222',
    public.order_deadline_for_order_date('2020-06-01'::date),
    'open'
  ),
  (
    'f0d33333-3333-4333-8333-333333333333',
    current_setting('test.primary_delivery_date')::date,
    current_setting('test.primary_order_date')::date,
    'f9333333-3333-4333-8333-333333333333',
    public.order_deadline_for_order_date('2020-06-01'::date),
    'open'
  );

insert into public.menu_items (
  id, lunch_day_id, provider_menu_item_id, name, price, item_type, unit_label, is_active
)
values
  (
    'f0a11111-1111-4111-8111-111111111111',
    'f0d11111-1111-4111-8111-111111111111',
    'fa111111-1111-4111-8111-111111111111',
    'Main A',
    10,
    'main',
    'Each',
    true
  ),
  (
    'f0a33333-3333-4333-8333-333333333333',
    'f0d33333-3333-4333-8333-333333333333',
    'fa333333-3333-4333-8333-333333333333',
    'Main C',
    10,
    'main',
    'Each',
    true
  );

set session_replication_role = replica;

insert into public.orders (
  id,
  profile_id,
  lunch_day_id,
  status,
  delivery_state,
  financial_disposition,
  is_late_order,
  late_order_created_by,
  late_order_approved_at,
  late_order_approved_by
)
values
  (
    'f0b11111-1111-4111-8111-111111111111',
    'f8222222-2222-4222-8222-222222222222',
    'f0d11111-1111-4111-8111-111111111111',
    'submitted',
    'pending',
    'chargeable',
    false,
    null,
    null,
    null
  ),
  (
    'f0b33333-3333-4333-8333-333333333333',
    'f8222222-2222-4222-8222-222222222222',
    'f0d33333-3333-4333-8333-333333333333',
    'submitted',
    'pending',
    'chargeable',
    false,
    null,
    null,
    null
  ),
  (
    'f0b99999-9999-4999-8999-999999999999',
    'f8222222-2222-4222-8222-222222222222',
    'f0d11111-1111-4111-8111-111111111111',
    'submitted',
    'pending',
    'chargeable',
    true,
    'f8111111-1111-4111-8111-111111111111',
    now(),
    'f8111111-1111-4111-8111-111111111111'
  );

insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity, unit_price)
values
  ('f0b11111-1111-4111-8111-111111111111', 'f0a11111-1111-4111-8111-111111111111', 'f0d11111-1111-4111-8111-111111111111', 1, 10),
  ('f0b33333-3333-4333-8333-333333333333', 'f0a33333-3333-4333-8333-333333333333', 'f0d33333-3333-4333-8333-333333333333', 1, 10);

set session_replication_role = default;
