begin;

select plan(12);

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

select lives_ok(
  $$ select public.set_my_default_office_location('e9100000-0000-4000-8000-000000000001') $$,
  'staff sets default office for scoped eligible-cycle assertions'
);

reset role;

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'e8122222-2222-4222-8222-222222222222',
  'NRQ Provider B',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'nrq-b@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
('e8222222-2222-4222-8222-222222222222', 'e8122222-2222-4222-8222-222222222222', 'Main B', 10, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'e8222222-2222-4222-8222-222222222222'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles('e9100000-0000-4000-8000-000000000001')) >= 2,
  'lists actionable cycles for multiple late-order providers before any submission'
);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'e8111111-1111-4111-8111-111111111111',
    (select scheduled_delivery_date from public.list_staff_late_order_eligible_cycles('e9100000-0000-4000-8000-000000000001') where provider_id = 'e8111111-1111-4111-8111-111111111111' limit 1),
    'Blocked cycle probe',
    1,
    null,
    'e9100000-0000-4000-8000-000000000001'
  ) $$,
  'creates pending request for first provider cycle'
);

select is(
  public.staff_late_order_new_request_available(),
  true,
  'another provider cycle remains actionable when only one provider/date is pending'
);

select is(
  (
    select count(*)::integer
    from public.list_staff_late_order_eligible_cycles('e9100000-0000-4000-8000-000000000001')
    where provider_id = 'e8122222-2222-4222-8222-222222222222'
  ) > 0,
  true,
  'pending request for provider A does not suppress provider B eligible cycles'
);

reset role;

update private.staff_late_order_requests
set status = 'fulfilled',
    fulfilled_at = now()
where requester_profile_id = 'e9111111-1111-4111-8111-111111111111'
  and provider_id = 'e8111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (
    select count(*)::integer
    from public.list_staff_late_order_eligible_cycles('e9100000-0000-4000-8000-000000000001')
    where provider_id = 'e8111111-1111-4111-8111-111111111111'
  ),
  0,
  'fulfilled request removes that provider/delivery cycle from actionable eligible list'
);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'e8122222-2222-4222-8222-222222222222',
    (select scheduled_delivery_date from public.list_staff_late_order_eligible_cycles('e9100000-0000-4000-8000-000000000001') where provider_id = 'e8122222-2222-4222-8222-222222222222' limit 1),
    'Block all cycles probe',
    1,
    null,
    'e9100000-0000-4000-8000-000000000001'
  ) $$,
  'creates pending request for remaining provider cycle'
);

select is(
  public.staff_late_order_new_request_available(),
  false,
  'no new late-order opportunity when every eligible cycle is blocked'
);

select is(
  (public.staff_late_order_new_request_summary()->>'available')::boolean,
  false,
  'summary reports unavailable when all actionable cycles are blocked'
);

select * from finish();
rollback;
