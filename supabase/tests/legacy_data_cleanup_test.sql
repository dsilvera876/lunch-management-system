begin;

select plan(6);

-- Fixture dates use January 2099 so provider orders stay before the cutoff.

-- ============================================================
-- Post-migration state: no legacy lunch days remain
-- ============================================================

select is_empty(
  $$
    select 1
    from public.lunch_days
    where provider_id is null
      and order_date is null
  $$,
  'Cleanup migration removes legacy manual lunch days'
);

select is_empty(
  $$
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'ensure_dev_legacy_lunch_day_fixture'
  $$,
  'No dev-only legacy lunch day fixture function is deployed'
);

-- ============================================================
-- Provider fixture survives cleanup (provider ordering model)
-- ============================================================

reset role;

insert into public.lunch_providers (id, name, active)
values ('d0111111-1111-4111-8111-111111111111', 'Cleanup Test Kitchen', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('d0222222-2222-4222-8222-222222222222', 'd0111111-1111-4111-8111-111111111111', 'Test Meal', 8.00, 'main', 'Each', true),
  ('d0222223-2222-4222-8222-222222222223', 'd0111111-1111-4111-8111-111111111111', 'Test Side', 2.00, 'side', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('d0222222-2222-4222-8222-222222222222', 1),
  ('d0222222-2222-4222-8222-222222222222', 2),
  ('d0222223-2222-4222-8222-222222222223', 1),
  ('d0222223-2222-4222-8222-222222222223', 2);

reset role;

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

insert into auth.users (id, email, raw_user_meta_data)
values ('d0333333-3333-4333-8333-333333333333', 'cleanup-staff@test.local', '{"full_name":"Cleanup Staff"}');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd0333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  'd0111111-1111-4111-8111-111111111111',
  '2099-01-06'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"d0222222-2222-4222-8222-222222222222","side_provider_menu_item_ids":["d0222223-2222-4222-8222-222222222223"],"standalone_items":[]}'::jsonb,
  null
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where ld.provider_id = 'd0111111-1111-4111-8111-111111111111'
      and ld.order_date is not null
  $$,
  array[1::bigint],
  'Provider-generated cycle and order remain intact after cleanup'
);

select isnt_empty(
  $$
    select 1
    from public.lunch_days ld
    where ld.provider_id = 'd0111111-1111-4111-8111-111111111111'
      and ld.order_date is not null
  $$,
  'Cleanup migration does not delete provider-based lunch cycles'
);

-- ============================================================
-- Financial summaries exclude legacy NULL-order-date rows
-- ============================================================

reset role;

\ir support/legacy_lunch_day_fixture.inc

insert into public.orders (id, profile_id, lunch_day_id, status)
values (
  'd0444444-4444-4444-8444-444444444444',
  'd0333333-3333-4333-8333-333333333333',
  '10000000-0000-0000-0000-000000000001',
  'submitted'
);

insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity, unit_price)
values (
  'd0444444-4444-4444-8444-444444444444',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1,
  12.00
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd0333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select public.financial_total_for_profile('d0333333-3333-4333-8333-333333333333', '2099-01-01'::date, '2099-12-31'::date) $$,
  array[10.00::numeric],
  'Financial summaries include only provider-based orders with order dates'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'd0333333-3333-4333-8333-333333333333'
      and ld.provider_id is null
  $$,
  array[1::bigint],
  'Legacy manual order may exist for non-financial workflows but is excluded from totals'
);

select * from finish();
rollback;
