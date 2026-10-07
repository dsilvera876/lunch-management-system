begin;

select plan(16);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'b1111111-1111-4111-8111-111111111111',
  'SLOR Late Provider',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'slor-kitchen@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time,
  primary_order_email = excluded.primary_order_email;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
(
  'c8111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'SLOR Late Main',
  10.00,
  'standalone',
  'Each',
  true
)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'c8111111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f8111111-1111-4111-8111-111111111111', 'slor-part-staff@test.local', '{"full_name":"SLOR Part Staff"}'),
  ('f8222222-2222-4222-8222-222222222222', 'slor-part-hr@test.local', '{"full_name":"SLOR Part HR"}'),
  ('f8333333-3333-4333-8333-333333333333', 'slor-part-accounts@test.local', '{"full_name":"SLOR Part Accounts"}'),
  ('f8444444-4444-4444-8444-444444444444', 'slor-part-admin@test.local', '{"full_name":"SLOR Part Admin"}'),
  ('f8555555-5555-4555-8555-555555555555', 'slor-part-owner@test.local', '{"full_name":"SLOR Part Owner"}'),
  ('f8666666-6666-4666-8666-666666666666', 'slor-part-inactive@test.local', '{"full_name":"SLOR Part Inactive"}');

reset role;
\ir support/isolate_existing_owner.inc
select private.apply_profile_role('f8111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('f8222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('f8333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('f8444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('f8555555-5555-4555-8555-555555555555', 'owner');
select private.apply_profile_role('f8666666-6666-4666-8666-666666666666', 'staff');

select private.activate_trusted_account_status_change();
update public.profiles
set account_status = 'inactive'
where id = 'f8666666-6666-4666-8666-666666666666';
select private.deactivate_trusted_account_status_change();

insert into public.office_locations (id, name, is_active)
values ('f9000000-0000-4000-8000-000000000001', 'SLOR Office', true)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'staff sets default office'
);
select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()) > 0,
  'staff role lists late-order eligible cycles'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'hr sets default office'
);
select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()) > 0,
  'hr role lists late-order eligible cycles'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'accounts sets default office'
);
select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()) > 0,
  'accounts role lists late-order eligible cycles'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'admin sets default office'
);
select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()) > 0,
  'admin role lists late-order eligible cycles'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.set_my_default_office_location('f9000000-0000-4000-8000-000000000001') $$,
  'owner sets default office'
);
select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()) > 0,
  'owner role lists late-order eligible cycles'
);

reset role;
select private.activate_trusted_profile_default_location();
update public.profiles
set default_office_location_id = null
where id = 'f8222222-2222-4222-8222-222222222222';
select set_config('app.trusted_profile_default_location', 'false', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()),
  0,
  'missing default office location yields no eligible cycles'
);

reset role;
select private.activate_trusted_profile_default_location();
update public.profiles
set default_office_location_id = 'f9000000-0000-4000-8000-000000000001'
where id = 'f8666666-6666-4666-8666-666666666666';
select set_config('app.trusted_profile_default_location', 'false', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select count(*) from public.list_staff_late_order_eligible_cycles() $$,
  'Authentication required',
  'inactive profile cannot list eligible cycles'
);

-- Ownership: HR only sees their own requests via get_my_staff_late_order_requests.
reset role;
select private.activate_trusted_profile_default_location();
update public.profiles
set default_office_location_id = 'f9000000-0000-4000-8000-000000000001'
where id in (
  'f8111111-1111-4111-8111-111111111111',
  'f8222222-2222-4222-8222-222222222222'
);
select set_config('app.trusted_profile_default_location', 'false', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Staff-only summary',
    1,
    null
  ) $$,
  'staff creates a late order request'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.get_my_staff_late_order_requests()),
  0,
  'hr get_my_staff_late_order_requests excludes other employees requests'
);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'HR personal summary',
    1,
    null
  ) $$,
  'hr creates their own late order request'
);

select is(
  (select count(*)::integer from public.get_my_staff_late_order_requests()),
  1,
  'hr get_my_staff_late_order_requests returns only own request'
);

select * from finish();

rollback;
