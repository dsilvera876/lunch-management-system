begin;

select plan(3);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.office_locations (id, name, is_active)
values
  ('e9100000-0000-4000-8000-000000000001', 'NRQ Office A', true),
  ('e9200000-0000-4000-8000-000000000002', 'NRQ Office B', true)
on conflict (id) do nothing;

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'e8111111-1111-4111-8111-111111111111',
  'NRQ Provider Off',
  true,
  false,
  'delivery_day',
  '12:00:00',
  'manual',
  'nrq-off@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = false;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e9111111-1111-4111-8111-111111111111', 'nrq-staff@test.local', '{"full_name":"NRQ Staff"}');

reset role;
select private.apply_profile_role('e9111111-1111-4111-8111-111111111111', 'staff');

reset role;
select private.activate_trusted_profile_default_location();
update public.profiles
set default_office_location_id = null
where id = 'e9111111-1111-4111-8111-111111111111';
select set_config('app.trusted_profile_default_location', 'false', true);

reset role;
update public.lunch_providers
set accepts_late_orders = false;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  public.staff_late_order_new_request_available(),
  false,
  'no late-order opportunity when every provider has late ordering disabled'
);

reset role;

update public.lunch_providers
set accepts_late_orders = true
where id = 'e8111111-1111-4111-8111-111111111111';

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
('e8211111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111111', 'Main', 10, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'e8211111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  public.staff_late_order_new_request_available(),
  true,
  'returns true when at least one active office has an eligible late-order cycle'
);

select is(
  (public.staff_late_order_new_request_summary()->>'available')::boolean,
  true,
  'summary reports available with eligible delivery dates and no provider payload'
);

select * from finish();
rollback;
