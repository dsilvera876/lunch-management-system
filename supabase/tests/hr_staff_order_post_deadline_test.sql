begin;

select plan(6);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b1111111-1111-4111-8111-111111111111', 'hr-pd-staff@test.local', '{"full_name":"HR PD Staff"}'),
  ('b2222222-2222-4222-8222-222222222222', 'hr-pd-hr@test.local', '{"full_name":"HR PD HR"}'),
  ('b3333333-3333-4333-8333-333333333333', 'hr-pd-acct@test.local', '{"full_name":"HR PD Accounts"}');

reset role;

select private.apply_profile_role('b2222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('b3333333-3333-4333-8333-333333333333', 'accounts');

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email)
values (
  'b8888888-8888-4888-8888-888888888888',
  'HR Post-Deadline Provider',
  true,
  'provider+hrpd@example.test'
);

insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'b0d11111-1111-4111-8111-111111111111',
  public.delivery_date_for_order_date('2020-01-06'::date),
  '2020-01-06'::date,
  'b8888888-8888-4888-8888-888888888888',
  public.order_deadline_for_order_date('2020-01-06'::date),
  'open'
);

insert into public.menu_items (
  id,
  lunch_day_id,
  name,
  price,
  item_type,
  unit_label,
  is_active
)
values
  (
    'b0a11111-1111-4111-8111-111111111111',
    'b0d11111-1111-4111-8111-111111111111',
    'Post-Deadline Main A',
    12.00,
    'main',
    'Each',
    true
  ),
  (
    'b0a22222-2222-4222-8222-222222222222',
    'b0d11111-1111-4111-8111-111111111111',
    'Post-Deadline Main B',
    13.00,
    'main',
    'Each',
    true
  ),
  (
    'b0a33333-3333-4333-8333-333333333333',
    'b0d11111-1111-4111-8111-111111111111',
    'Post-Deadline Side',
    3.00,
    'side',
    'Each',
    true
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);
select public.create_first_lunch_period('HR PD Payroll', '2020-01-01', '2020-01-31');
reset role;

set session_replication_role = replica;

insert into public.orders (
  id,
  profile_id,
  lunch_day_id,
  status,
  delivery_state,
  financial_disposition,
  is_late_order,
  meal_quantity,
  office_location_id
)
values (
  'b0b11111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'b0d11111-1111-4111-8111-111111111111',
  'submitted',
  'pending',
  'chargeable',
  false,
  1,
  'f0000000-0000-4000-8000-000000000001'
);

insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity, unit_price)
values
  (
    'b0b11111-1111-4111-8111-111111111111',
    'b0a11111-1111-4111-8111-111111111111',
    'b0d11111-1111-4111-8111-111111111111',
    1,
    12.00
  ),
  (
    'b0b11111-1111-4111-8111-111111111111',
    'b0a33333-3333-4333-8333-333333333333',
    'b0d11111-1111-4111-8111-111111111111',
    1,
    3.00
  );

set session_replication_role = origin;

select ok(
  not public.is_before_order_deadline('2020-01-06'::date, now()),
  'normal staff ordering deadline has passed for fixture order date'
);

select ok(
  now() > public.order_deadline_for_order_date('2020-01-06'::date),
  'effective order deadline is before current time'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.replace_order_items(
    'b0b11111-1111-4111-8111-111111111111'::uuid,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_menu_item_id', 'b0a22222-2222-4222-8222-222222222222'::uuid,
      'side_menu_item_ids', jsonb_build_array('b0a33333-3333-4333-8333-333333333333'::uuid),
      'standalone_items', '[]'::jsonb
    )
  ) $$,
  'P0001',
  'The ordering deadline has passed',
  'staff replace_order_items blocked after deadline'
);

select throws_ok(
  $$ select public.cancel_order('b0b11111-1111-4111-8111-111111111111'::uuid) $$,
  'P0001',
  'The ordering deadline has passed',
  'staff cancel_order blocked after deadline'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.hr_modify_staff_order(
    'b0b11111-1111-4111-8111-111111111111'::uuid,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_menu_item_id', 'b0a22222-2222-4222-8222-222222222222'::uuid,
      'side_menu_item_ids', jsonb_build_array('b0a33333-3333-4333-8333-333333333333'::uuid),
      'standalone_items', '[]'::jsonb
    ),
    'HR post-deadline modify',
    (select updated_at from public.orders where id = 'b0b11111-1111-4111-8111-111111111111'::uuid)
  ) $$,
  'hr_modify_staff_order succeeds after staff deadline'
);

select lives_ok(
  $$ select public.hr_cancel_staff_order(
    'b0b11111-1111-4111-8111-111111111111'::uuid,
    'HR post-deadline cancel',
    (select updated_at from public.orders where id = 'b0b11111-1111-4111-8111-111111111111'::uuid)
  ) $$,
  'hr_cancel_staff_order succeeds after staff deadline'
);

select * from finish();

rollback;
