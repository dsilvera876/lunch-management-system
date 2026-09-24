begin;

select plan(32);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'rec-staff@test.local', '{"full_name":"Rec Staff"}'),
  ('22222222-2222-4222-8222-222222222222', 'rec-hr@test.local', '{"full_name":"Rec HR"}'),
  ('33333333-3333-4333-8333-333333333333', 'rec-accounts@test.local', '{"full_name":"Rec Accounts"}'),
  ('44444444-4444-4444-8444-444444444444', 'rec-admin@test.local', '{"full_name":"Rec Admin"}'),
  ('55555555-5555-4555-8555-555555555555', 'rec-owner@test.local', '{"full_name":"Rec Owner"}');

reset role;

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'owner');

reset role;

insert into public.lunch_providers (id, name, active)
values ('88888888-8888-4888-8888-888888888888', 'Rec Provider', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('a1111111-1111-4111-8111-111111111111', '88888888-8888-4888-8888-888888888888', 'Fried Chicken', 12.00, 'main', 'Each', true),
  ('a2222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'Rice & Peas', 3.00, 'side', 'Each', true),
  ('a3333333-3333-4333-8333-333333333333', '88888888-8888-4888-8888-888888888888', 'BBQ Chicken', 13.00, 'main', 'Each', true),
  ('a4444444-4444-4444-8444-444444444444', '88888888-8888-4888-8888-888888888888', 'Coconut Water', 2.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('a1111111-1111-4111-8111-111111111111', 5),
  ('a2222222-2222-4222-8222-222222222222', 5),
  ('a3333333-3333-4333-8333-333333333333', 5),
  ('a4444444-4444-4444-8444-444444444444', 5);

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('Rec Payroll', '2099-01-01', '2099-01-31');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'Extra sauce',
  'f0000000-0000-4000-8000-000000000001'
);

reset role;

set local role authenticated;

-- ============================================================
-- Security
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.mark_order_delivered((select id from public.orders limit 1)) $$,
  'P0001',
  'Delivery reconciliation access required',
  'Staff cannot reconcile deliveries'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.mark_order_delivered((select id from public.orders limit 1)) $$,
  'P0001',
  'Delivery reconciliation access required',
  'Accounts cannot reconcile deliveries'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.mark_order_delivered(
    (select id from public.orders where special_instructions = 'Extra sauce'),
    '2099-01-12'::date
  ) $$,
  'HR can mark an order delivered'
);

select results_eq(
  $$ select delivery_state from public.orders where special_instructions = 'Extra sauce' $$,
  array['delivered'::text],
  'Delivered order uses delivered delivery state'
);

select results_eq(
  $$ select financial_disposition from public.orders where special_instructions = 'Extra sauce' $$,
  array['chargeable'::text],
  'Delivered order remains chargeable'
);

select results_eq(
  $$ select actual_delivery_date::text from public.orders where special_instructions = 'Extra sauce' $$,
  array['2099-01-12'::text],
  'Delivered order records actual delivery date'
);

-- ============================================================
-- Issue reporting and on_hold financial exclusion
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"a4444444-4444-4444-8444-444444444444","quantity":1}]}'::jsonb,
  'Issue test A',
  'f0000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue(
  (select id from public.orders where special_instructions = 'Issue test A'),
  'not_delivered',
  'Provider missed the drop',
  'deliver_later_today'
);

select results_eq(
  $$ select delivery_state from public.orders where special_instructions = 'Issue test A' $$,
  array['issue_open'::text],
  'Reported issue opens delivery state and puts charge on hold'
);

select results_eq(
  $$ select financial_disposition from public.orders where special_instructions = 'Issue test A' $$,
  array['on_hold'::text],
  'Reported issue puts financial disposition on hold'
);

select results_eq(
  $$ select delivery_issue_type from public.orders where special_instructions = 'Issue test A' $$,
  array['not_delivered'::text],
  'Reported issue records issue type'
);

select results_eq(
  $$
    select count(*)::bigint
    from private.qualifying_financial_orders(
      '11111111-1111-4111-8111-111111111111',
      '2099-01-01'::date,
      '2099-01-31'::date,
      null
    )
  $$,
  array[1::bigint],
  'On-hold issue order is excluded from financial totals'
);

-- ============================================================
-- Resolution delivered and waived
-- ============================================================

select lives_ok(
  $$ select public.confirm_order_delivery_resolved(
    (select id from public.orders where special_instructions = 'Issue test A'),
    '2099-01-13'::date
  ) $$,
  'HR can confirm replacement delivery'
);

select results_eq(
  $$ select delivery_state from public.orders where special_instructions = 'Issue test A' $$,
  array['resolved'::text],
  'Resolved replacement uses resolved delivery state'
);

select results_eq(
  $$ select financial_disposition from public.orders where special_instructions = 'Issue test A' $$,
  array['chargeable'::text],
  'Resolved replacement becomes chargeable on actual delivery date'
);

select results_eq(
  $$ select actual_delivery_date::text from public.orders where special_instructions = 'Issue test A' $$,
  array['2099-01-13'::text],
  'Resolved replacement records actual delivery date'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"a4444444-4444-4444-8444-444444444444","quantity":1}]}'::jsonb,
  'Issue test B',
  'f0000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue(
  (select id from public.orders where special_instructions = 'Issue test B'),
  'provider_cancelled',
  'No replacement available',
  'no_replacement_no_charge'
);

select lives_ok(
  $$ select public.resolve_order_no_charge(
    (select id from public.orders where special_instructions = 'Issue test B'),
    'Employee not charged'
  ) $$,
  'HR can resolve with no charge'
);

select results_eq(
  $$ select financial_disposition from public.orders where special_instructions = 'Issue test B' $$,
  array['waived'::text],
  'No-charge resolution waives financial disposition'
);

select results_eq(
  $$ select delivery_state from public.orders where special_instructions = 'Issue test B' $$,
  array['resolved'::text],
  'No-charge resolution closes delivery state'
);

select results_eq(
  $$
    select count(*)::bigint
    from private.qualifying_financial_orders(
      '11111111-1111-4111-8111-111111111111',
      '2099-01-01'::date,
      '2099-01-31'::date,
      null
    )
  $$,
  array[2::bigint],
  'Waived order stays excluded while chargeable orders remain included'
);

-- ============================================================
-- One-step report + resolve no charge
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'One step no charge',
  'f0000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.report_order_delivery_issue_resolved_no_charge(
    (select id from public.orders where special_instructions = 'One step no charge'),
    'provider_cancelled',
    'Cancelled by provider'
  ) $$,
  'HR can report and resolve no charge in one RPC'
);

select results_eq(
  $$ select delivery_state from public.orders where special_instructions = 'One step no charge' $$,
  array['resolved'::text],
  'One-step no charge ends in resolved delivery state'
);

select results_eq(
  $$ select financial_disposition from public.orders where special_instructions = 'One step no charge' $$,
  array['waived'::text],
  'One-step no charge ends in waived financial disposition'
);

select results_eq(
  $$ select delivery_issue_type from public.orders where special_instructions = 'One step no charge' $$,
  array['provider_cancelled'::text],
  'One-step no charge retains issue type'
);

select results_eq(
  $$ select delivery_resolution_type from public.orders where special_instructions = 'One step no charge' $$,
  array['no_replacement_no_charge'::text],
  'One-step no charge retains resolution type'
);

-- ============================================================
-- Order adjustment audit
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'Adjust test',
  'f0000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue(
  (select id from public.orders where special_instructions = 'Adjust test'),
  'wrong_order',
  'Substitute requested',
  'substitute_accepted'
);

select lives_ok(
  $$
    select public.adjust_operational_order_items(
      (select id from public.orders where special_instructions = 'Adjust test'),
      (
        select jsonb_build_object(
          'meal_quantity', 1,
          'main_menu_item_id', mi.id,
          'side_menu_item_ids', jsonb_build_array(side_item.id),
          'standalone_items', '[]'::jsonb
        )
        from public.orders o
        join public.lunch_days ld on ld.id = o.lunch_day_id
        join public.menu_items mi on mi.lunch_day_id = ld.id and mi.name = 'BBQ Chicken'
        join public.menu_items side_item on side_item.lunch_day_id = ld.id and side_item.name = 'Rice & Peas'
        where o.special_instructions = 'Adjust test'
        limit 1
      ),
      'Accepted BBQ substitute'
    )
  $$,
  'HR can substitute within provider snapshot'
);

select cmp_ok(
  (
    select public.calculate_order_total(id)
    from public.orders
    where special_instructions = 'Adjust test'
    limit 1
  ),
  '>',
  12.00::numeric,
  'Substituted order total uses snapshot replacement price'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.order_delivery_events
    where event_type = 'order_adjusted'
  $$,
  array[1::bigint],
  'Order adjustment creates audit event'
);

select throws_ok(
  $$ update public.order_delivery_events set payload = '{}'::jsonb where true $$,
  '42501',
  null,
  'Authenticated users cannot edit delivery audit events'
);

select lives_ok(
  $$ select public.confirm_order_delivery_resolved(
    (select id from public.orders where special_instructions = 'Adjust test'),
    '2099-01-12'::date
  ) $$,
  'HR closes adjusted order after substitution'
);

-- ============================================================
-- Finalization blocker
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-16'::date,
  '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"a4444444-4444-4444-8444-444444444444","quantity":1}]}'::jsonb,
  'Finalization blocker',
  'f0000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue(
  (select id from public.orders where special_instructions = 'Finalization blocker'),
  'damaged',
  'Box crushed',
  'replacement_next_business_day'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Rec Payroll')) $$,
  'P0001',
  null,
  'Finalization blocked while orders still require delivery reconciliation'
);

select results_eq(
  $$ select public.get_lunch_period_unresolved_delivery_issue_count((select id from public.lunch_periods where label = 'Rec Payroll')) $$,
  array[1::bigint],
  'Accounts can read unreconciled delivery order count'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.resolve_order_no_charge(
    (select id from public.orders where special_instructions = 'Finalization blocker'),
    'Closed with no charge'
  ) $$,
  'HR resolves remaining blocker issue'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Rec Payroll')) $$,
  'Finalization succeeds after unresolved delivery issues are cleared'
);

select * from finish();
rollback;
