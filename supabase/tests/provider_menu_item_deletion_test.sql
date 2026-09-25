begin;

select plan(6);

\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'f1111111-1111-4111-8111-111111111111',
  'pmi-del-staff@test.local',
  '{"full_name":"PMI Del Staff"}'
),
(
  'f2222222-2222-4222-8222-222222222222',
  'pmi-del-hr@test.local',
  '{"full_name":"PMI Del HR"}'
);

reset role;
select private.apply_profile_role('f2222222-2222-4222-8222-222222222222', 'hr');

insert into public.lunch_providers (id, name, active)
values ('e1111111-1111-4111-8111-111111111111', 'PMI Delete Provider', true);

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  item_type,
  unit_label,
  active
)
values
(
  'e2222222-2222-4222-8222-222222222222',
  'e1111111-1111-4111-8111-111111111111',
  'Unused Item',
  5.00,
  'standalone',
  'Each',
  true
),
(
  'e3333333-3333-4333-8333-333333333333',
  'e1111111-1111-4111-8111-111111111111',
  'Snapshot Item',
  6.00,
  'standalone',
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
  'e4444444-4444-4444-8444-444444444444',
  'e1111111-1111-4111-8111-111111111111',
  '2099-02-03',
  '2099-02-04',
  '2099-02-03 16:00:00+00',
  'open'
);

insert into public.menu_items (
  id,
  lunch_day_id,
  name,
  price,
  item_type,
  unit_label,
  provider_menu_item_id
)
values (
  'e5555555-5555-4555-8555-555555555555',
  'e4444444-4444-4444-8444-444444444444',
  'Snapshot Item',
  6.00,
  'standalone',
  'Each',
  'e3333333-3333-4333-8333-333333333333'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.delete_unused_provider_menu_item(
    'e1111111-1111-4111-8111-111111111111',
    'e2222222-2222-4222-8222-222222222222'
  ) $$,
  'unused provider menu item can be deleted'
);

select is(
  (select count(*)::integer from public.provider_menu_items where id = 'e2222222-2222-4222-8222-222222222222'),
  0,
  'unused provider menu item row is removed'
);

select throws_like(
  $$ select public.delete_unused_provider_menu_item(
    'e1111111-1111-4111-8111-111111111111',
    'e3333333-3333-4333-8333-333333333333'
  ) $$,
  '%cannot be permanently deleted%',
  'snapshot-linked provider menu item cannot be deleted'
);

select is(
  (select count(*)::integer from public.provider_menu_items where id = 'e3333333-3333-4333-8333-333333333333'),
  1,
  'blocked provider menu item remains'
);

select is(
  (select count(*)::integer from public.menu_items where id = 'e5555555-5555-4555-8555-555555555555'),
  1,
  'lunch-day menu snapshot is preserved when delete is blocked'
);

reset role;
select private.apply_profile_role('f1111111-1111-4111-8111-111111111111', 'staff');

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
  'e6666666-6666-4666-8666-666666666666',
  'e1111111-1111-4111-8111-111111111111',
  'Staff Delete Try',
  4.00,
  'standalone',
  'Each',
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_like(
  $$ select public.delete_unused_provider_menu_item(
    'e1111111-1111-4111-8111-111111111111',
    'e6666666-6666-4666-8666-666666666666'
  ) $$,
  '%Not authorized%',
  'staff cannot delete provider menu items'
);

select * from finish();
rollback;
