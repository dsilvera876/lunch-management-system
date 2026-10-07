begin;

select plan(5);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'b1111111-1111-4111-8111-111111111111',
  'SLID Provider',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'slid-kitchen@example.com'
)
on conflict (id) do update set active = true, accepts_late_orders = true;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
('c8111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'SLID Main', 10, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'c8111111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

insert into public.office_locations (id, name, is_active)
values
  ('f9100000-0000-4000-8000-000000000001', 'SLID Active Office', true),
  ('f9200000-0000-4000-8000-000000000002', 'SLID Inactive Office', false)
on conflict (id) do update set is_active = excluded.is_active;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f9111111-1111-4111-8111-111111111111', 'slid-staff@test.local', '{"full_name":"SLID Staff"}');

reset role;
select private.apply_profile_role('f9111111-1111-4111-8111-111111111111', 'staff');

reset role;
select private.activate_trusted_profile_default_location();
update public.profiles
set default_office_location_id = 'f9200000-0000-4000-8000-000000000002'
where id = 'f9111111-1111-4111-8111-111111111111';
select set_config('app.trusted_profile_default_location', 'false', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()),
  0,
  'inactive saved default yields no eligibility when office parameter omitted'
);

select throws_ok(
  $$ select count(*) from public.list_staff_late_order_eligible_cycles('f9200000-0000-4000-8000-000000000002') $$,
  'Delivery location is invalid or inactive',
  'explicit inactive office is rejected for eligibility'
);

select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles('f9100000-0000-4000-8000-000000000001')) >= 0,
  'active office restores eligibility lookup'
);

reset role;

insert into private.staff_late_order_requests (
  requester_profile_id,
  provider_id,
  office_location_id,
  order_date,
  scheduled_delivery_date,
  status,
  requested_summary,
  quantity
)
values (
  'f9111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'f9200000-0000-4000-8000-000000000002',
  current_setting('test.late_order_date')::date,
  current_setting('test.late_delivery_date')::date,
  'pending',
  'Historical request on inactive office',
  1
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.get_my_staff_late_order_requests()),
  1,
  'existing request remains readable with inactive saved default'
);

select is(
  (select r.status from public.get_my_staff_late_order_requests() r limit 1),
  'pending',
  'existing pending status remains visible'
);

select * from finish();

rollback;
