begin;

select plan(23);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'sec-staff@test.local', '{"full_name":"Sec Staff"}'),
  ('22222222-2222-4222-8222-222222222222', 'sec-hr@test.local', '{"full_name":"Sec HR"}'),
  ('33333333-3333-4333-8333-333333333333', 'sec-accounts@test.local', '{"full_name":"Sec Accounts"}'),
  ('44444444-4444-4444-8444-444444444444', 'sec-admin@test.local', '{"full_name":"Sec Admin"}');

reset role;

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');

reset role;

insert into public.lunch_providers (id, name, active)
values ('88888888-8888-4888-8888-888888888888', 'Sec Provider', true);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('a1111111-1111-4111-8111-111111111111', '88888888-8888-4888-8888-888888888888', 'Fried Chicken', 12.00, 'main', 'Each', true),
  ('a2222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'Rice & Peas', 3.00, 'side', 'Each', true),
  ('a4444444-4444-4444-8444-444444444444', '88888888-8888-4888-8888-888888888888', 'Coconut Water', 2.00, 'standalone', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('a1111111-1111-4111-8111-111111111111', 5),
  ('a2222222-2222-4222-8222-222222222222', 5),
  ('a4444444-4444-4444-8444-444444444444', 5);

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('Sec Payroll', '2099-02-01', '2099-02-28');
reset role;

-- Helper: submit a standalone order with a marker instruction.
create or replace function pg_temp.submit_sec_order(p_marker text, p_order_date date default '2099-02-06'::date)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

  perform public.submit_provider_order(
    '88888888-8888-4888-8888-888888888888',
    p_order_date,
    '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"a4444444-4444-4444-8444-444444444444","quantity":1}]}'::jsonb,
    p_marker,
    'f0000000-0000-4000-8000-000000000001'
  );

  select id
  into v_order_id
  from public.orders
  where special_instructions = p_marker
  order by created_at desc
  limit 1;

  return v_order_id;
end;
$$;

set local role authenticated;

-- ============================================================
-- Finalization blocking matrix
-- ============================================================

select pg_temp.submit_sec_order('Pending blocker');

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Sec Payroll')) $$,
  'P0001',
  null,
  'Pending order blocks finalization'
);

select results_eq(
  $$ select public.get_lunch_period_unresolved_delivery_issue_count((select id from public.lunch_periods where label = 'Sec Payroll')) $$,
  array[1::bigint],
  'Pending order counts toward unreconciled delivery total'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.mark_order_delivered((select id from public.orders where special_instructions = 'Pending blocker')) $$,
  'HR marks pending order delivered'
);

select pg_temp.submit_sec_order('Issue blocker');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue(
  (select id from public.orders where special_instructions = 'Issue blocker'),
  'not_delivered',
  'Internal HR note for issue blocker',
  'deliver_later_today'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Sec Payroll')) $$,
  'P0001',
  null,
  'Open delivery issue blocks finalization'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.confirm_order_delivery_resolved((select id from public.orders where special_instructions = 'Issue blocker')) $$,
  'HR resolves issue blocker as chargeable'
);

select pg_temp.submit_sec_order('Waived blocker');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue(
  (select id from public.orders where special_instructions = 'Waived blocker'),
  'provider_cancelled',
  'Internal waived note',
  'no_replacement_no_charge'
);

select lives_ok(
  $$ select public.resolve_order_no_charge((select id from public.orders where special_instructions = 'Waived blocker'), 'Closed waived') $$,
  'HR resolves waived blocker'
);

-- Cancelled waived orders do not block reconciliation counts.
select pg_temp.submit_sec_order('Cancelled check');

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.cancel_order((select id from public.orders where special_instructions = 'Cancelled check')) $$,
  'Staff cancels order for finalization check'
);

select results_eq(
  $$
    select private.count_unreconciled_delivery_orders(
      (select id from public.lunch_periods where label = 'Sec Payroll')
    )
  $$,
  array[0::bigint],
  'Cancelled waived order does not block finalization'
);

-- Operational adjustment requires an open issue.
select pg_temp.submit_sec_order('Adjust auth');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.adjust_operational_order_items(
    (select id from public.orders where special_instructions = 'Adjust auth'),
    '{"meal_quantity":null,"main_menu_item_id":null,"side_menu_item_ids":[],"standalone_items":[]}'::jsonb,
    'Should fail'
  ) $$,
  'P0001',
  'Operational adjustments require an open delivery issue',
  'Operational adjustment rejected without open delivery issue'
);

select lives_ok(
  $$ select public.mark_order_delivered((select id from public.orders where special_instructions = 'Adjust auth')) $$,
  'HR delivers adjust auth order before mixed finalization checks'
);

-- Mixed period: one pending among reconciled orders blocks until cleared.
select pg_temp.submit_sec_order('Mixed pending');

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Sec Payroll')) $$,
  'P0001',
  null,
  'Mixed period blocks while any applicable order remains unreconciled'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.mark_order_delivered((select id from public.orders where special_instructions = 'Mixed pending')) $$,
  'HR clears mixed pending order'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.finalize_lunch_period((select id from public.lunch_periods where label = 'Sec Payroll')) $$,
  'Delivered chargeable, resolved chargeable, and resolved waived permit finalization'
);

-- ============================================================
-- HR notes and audit confidentiality
-- ============================================================

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'hr_delivery_notes'
  ),
  'HR delivery notes are not stored on orders'
);

select ok(
  has_table_privilege('authenticated', 'public.order_delivery_reconciliation', 'SELECT')
  and not has_table_privilege('authenticated', 'public.order_delivery_reconciliation', 'INSERT')
  and not has_table_privilege('authenticated', 'public.order_delivery_reconciliation', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.order_delivery_reconciliation', 'DELETE'),
  'HR notes table grants SELECT only to authenticated'
);

select ok(
  has_table_privilege('authenticated', 'public.order_delivery_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.order_delivery_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.order_delivery_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.order_delivery_events', 'DELETE'),
  'Audit table grants SELECT only to authenticated'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::bigint from public.order_delivery_reconciliation $$,
  array[0::bigint],
  'Staff cannot read HR delivery notes via RLS'
);

select results_eq(
  $$ select count(*)::bigint from public.order_delivery_events $$,
  array[0::bigint],
  'Staff cannot read delivery audit events via RLS'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::bigint from public.order_delivery_reconciliation $$,
  array[0::bigint],
  'Accounts cannot read HR delivery notes via RLS'
);

select results_eq(
  $$ select count(*)::bigint from public.order_delivery_events $$,
  array[0::bigint],
  'Accounts cannot read delivery audit events via RLS'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select cmp_ok(
  (select count(*) from public.order_delivery_events),
  '>',
  0::bigint,
  'HR can read delivery audit events'
);

select cmp_ok(
  (
    select count(*)
    from public.order_delivery_reconciliation
    where hr_delivery_notes is not null
  ),
  '>',
  0::bigint,
  'HR can read stored HR delivery notes'
);

select throws_ok(
  $$ update public.order_delivery_events set payload = '{}'::jsonb where true $$,
  '42501',
  null,
  'Authenticated users cannot edit delivery audit events'
);

select * from finish();
rollback;
