begin;

select plan(14);

-- Clear session-scoped test date overrides leaked from earlier pgTAP files.
select set_config('test.jamaica_today', '', false);
select set_config('app.pgtap_test_session', '', false);

\ir support/reset_app_settings_baseline.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b1111111-1111-4111-8111-111111111111', 'lunch-day-staff@test.local', '{"full_name":"Lunch Day Staff"}'),
  ('b1222222-2222-4222-8222-222222222222', 'lunch-day-hr@test.local', '{"full_name":"Lunch Day HR"}'),
  ('b1333333-3333-4333-8333-333333333333', 'lunch-day-user2@test.local', '{"full_name":"Lunch Day User Two"}');

reset role;
select private.apply_profile_role('b1111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('b1222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('b1333333-3333-4333-8333-333333333333', 'staff');

\ir support/open_ordering.inc

-- 2099-01-05 is Monday; delivery lunch_date is 2099-01-06 (Tuesday).

insert into public.lunch_providers (id, name, active, primary_order_email)
values (
  'b9000000-0000-0000-0000-000000000099',
  'Lunch Day Reuse Provider',
  true,
    'provider-order+fixture@example.test'
);

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  item_type,
  unit_label,
  active
)
values (
  'b9111111-1111-4111-8111-111111111111',
  'b9000000-0000-0000-0000-000000000099',
  'Reuse Test Bowl',
  10.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('b9111111-1111-4111-8111-111111111111', 1);

-- Snapshot row exists for delivery date but a different order_date (staging/worker drift).
insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'b1000000-0000-0000-0000-000000000001',
  public.delivery_date_for_order_date('2099-01-05'::date),
  '2099-01-04'::date,
  'b9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-04'::date),
  'open'
);

insert into public.menu_items (
  id,
  lunch_day_id,
  provider_menu_item_id,
  name,
  price,
  item_type,
  unit_label,
  is_active
)
values (
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b9111111-1111-4111-8111-111111111111',
  'Reuse Test Bowl',
  10.00,
  'standalone',
  'Each',
  true
);

-- A) Staff user: normal submit_provider_order reuses existing lunch_day.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"b9111111-1111-4111-8111-111111111111","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'Staff submit succeeds when lunch_day already exists for provider delivery date'
);

select is(
  (
    select lunch_day_id
    from public.orders
    where profile_id = 'b1111111-1111-4111-8111-111111111111'
    order by created_at desc
    limit 1
  ),
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'Staff order links to pre-existing lunch_day row'
);

select is(
  (
    select count(*)::integer
    from public.lunch_days
    where provider_id = 'b9000000-0000-0000-0000-000000000099'
      and lunch_date = public.delivery_date_for_order_date('2099-01-05'::date)
  ),
  1,
  'No duplicate lunch_days for provider delivery date after staff order'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'b1111111-1111-4111-8111-111111111111'
  ),
  1,
  'Staff order creates exactly one order-submitted notification intent'
);

-- B) HR user on same provider/date reuses the same lunch_day.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"b9111111-1111-4111-8111-111111111111","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'HR submit succeeds when lunch_day already exists for provider delivery date'
);

select is(
  (
    select count(*)::integer
    from public.lunch_days
    where provider_id = 'b9000000-0000-0000-0000-000000000099'
      and lunch_date = public.delivery_date_for_order_date('2099-01-05'::date)
  ),
  1,
  'HR order still leaves a single lunch_day for provider delivery date'
);

-- D) Second staff user on same provider/date.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"b9111111-1111-4111-8111-111111111111","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'Second user submit succeeds against shared lunch_day'
);

reset role;

-- C) First order for a new provider/date creates exactly one lunch_day.
insert into public.lunch_providers (id, name, active, primary_order_email)
values (
  'b9000000-0000-0000-0000-000000000088',
  'Lunch Day Fresh Provider',
  true,
    'provider-order+fixture@example.test'
);

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  item_type,
  unit_label,
  active
)
values (
  'b9222222-2222-4222-8222-222222222222',
  'b9000000-0000-0000-0000-000000000088',
  'Fresh Bowl',
  11.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('b9222222-2222-4222-8222-222222222222', 1);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b9000000-0000-0000-0000-000000000088',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"b9222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'First order creates lunch_day when none exists yet'
);

select is(
  (
    select count(*)::integer
    from public.lunch_days
    where provider_id = 'b9000000-0000-0000-0000-000000000088'
      and lunch_date = public.delivery_date_for_order_date('2099-01-05'::date)
  ),
  1,
  'Exactly one lunch_day created for new provider delivery date'
);

-- E) Repeated ensure_provider_lunch_day calls reuse the same row (concurrency-safe path).
reset role;

select is(
  private.ensure_provider_lunch_day(
    'b9000000-0000-0000-0000-000000000088',
    '2099-01-05'::date
  ),
  (
    select id
    from public.lunch_days
    where provider_id = 'b9000000-0000-0000-0000-000000000088'
      and lunch_date = public.delivery_date_for_order_date('2099-01-05'::date)
    limit 1
  ),
  'Second ensure_provider_lunch_day returns existing lunch_day id'
);

select is(
  (
    select count(*)::integer
    from public.lunch_days
    where provider_id = 'b9000000-0000-0000-0000-000000000088'
      and lunch_date = public.delivery_date_for_order_date('2099-01-05'::date)
  ),
  1,
  'Repeated ensure does not insert duplicate lunch_days'
);

-- F) Failed validation before order insert leaves no notification intent.
reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'b1333333-3333-4333-8333-333333333333'
  ),
  1,
  'Baseline: second user already has one notification intent from successful order'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[]}'::jsonb,
      null
    )
  $$,
  'Order must contain at least one item',
  'Empty order fails before lunch_day insert path completes order'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'b1333333-3333-4333-8333-333333333333'
  ),
  1,
  'Failed order does not add another notification intent'
);

select * from finish();
rollback;
