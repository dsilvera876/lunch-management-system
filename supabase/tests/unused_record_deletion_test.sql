begin;

select plan(10);

\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'f1111111-1111-4111-8111-111111111111',
  'del-staff@test.local',
  '{"full_name":"Del Staff"}'
),
(
  'f2222222-2222-4222-8222-222222222222',
  'del-hr@test.local',
  '{"full_name":"Del HR"}'
);

reset role;
select private.apply_profile_role('f2222222-2222-4222-8222-222222222222', 'hr');

-- Providers

insert into public.lunch_providers (id, name, active)
values
  ('e1111111-1111-4111-8111-111111111111', 'Unused Provider', true),
  ('e2222222-2222-4222-8222-222222222222', 'Menu Provider', true),
  ('e3333333-3333-4333-8333-333333333333', 'Snapshot Provider', true),
  ('e4444444-4444-4444-8444-444444444444', 'Dispatch Provider', true);

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
  'e5555555-5555-4555-8555-555555555555',
  'e2222222-2222-4222-8222-222222222222',
  'Blocked Item',
  5.00,
  'main',
  'Each',
  true
);

insert into public.lunch_days (
  id,
  provider_id,
  order_date,
  lunch_date,
  order_deadline,
  status
)
values (
  'e6666666-6666-4666-8666-666666666666',
  'e3333333-3333-4333-8333-333333333333',
  '2099-01-05',
  '2099-01-06',
  '2099-01-05 16:00:00+00',
  'open'
);

insert into public.provider_late_order_dispatches (
  id,
  provider_id,
  scheduled_delivery_date,
  dispatch_type,
  status
)
values (
  'e7777777-7777-4777-8777-777777777777',
  'e4444444-4444-4444-8444-444444444444',
  '2099-01-06',
  'manual',
  'sent'
);

-- Office locations

insert into public.office_locations (id, name, is_active)
values
  ('e8888888-8888-4888-8888-888888888888', 'Unused Office', true),
  ('e9999999-9999-4999-8999-999999999999', 'Default Office', true),
  ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Order Office', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select public.set_my_default_office_location('e9999999-9999-4999-8999-999999999999');

reset role;

insert into public.orders (
  id,
  profile_id,
  lunch_day_id,
  status,
  office_location_id
)
values (
  'eccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'f2222222-2222-4222-8222-222222222222',
  'e6666666-6666-4666-8666-666666666666',
  'submitted',
  'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

-- HR can delete unused provider

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.delete_unused_lunch_provider('e1111111-1111-4111-8111-111111111111') $$,
  'unused provider can be deleted'
);

select is(
  (select count(*)::integer from public.lunch_providers where id = 'e1111111-1111-4111-8111-111111111111'),
  0,
  'unused provider row is removed'
);

select throws_like(
  $$ select public.delete_unused_lunch_provider('e2222222-2222-4222-8222-222222222222') $$,
  '%cannot be deleted%',
  'provider with menu items cannot be deleted'
);

select throws_like(
  $$ select public.delete_unused_lunch_provider('e3333333-3333-4333-8333-333333333333') $$,
  '%cannot be deleted%',
  'provider with lunch day snapshot cannot be deleted'
);

select throws_like(
  $$ select public.delete_unused_lunch_provider('e4444444-4444-4444-8444-444444444444') $$,
  '%cannot be deleted%',
  'provider with dispatch history cannot be deleted'
);

select lives_ok(
  $$ select public.delete_unused_office_location('e8888888-8888-4888-8888-888888888888') $$,
  'unused office location can be deleted'
);

select throws_like(
  $$ select public.delete_unused_office_location('e9999999-9999-4999-8999-999999999999') $$,
  '%cannot be deleted%',
  'profile default office location cannot be deleted'
);

select throws_like(
  $$ select public.delete_unused_office_location('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '%cannot be deleted%',
  'order-used office location cannot be deleted'
);

reset role;
select private.apply_profile_role('f1111111-1111-4111-8111-111111111111', 'staff');

insert into public.lunch_providers (id, name, active)
values ('e0000000-0000-4000-8000-000000000001', 'Staff Delete Try', true);

insert into public.office_locations (id, name, is_active)
values ('e0000000-0000-4000-8000-000000000002', 'Staff Loc Delete', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_like(
  $$ select public.delete_unused_lunch_provider('e0000000-0000-4000-8000-000000000001') $$,
  '%Not authorized%',
  'staff cannot delete providers'
);

select throws_like(
  $$ select public.delete_unused_office_location('e0000000-0000-4000-8000-000000000002') $$,
  '%Not authorized%',
  'staff cannot delete office locations'
);

select * from finish();
rollback;
