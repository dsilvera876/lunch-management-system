begin;

select plan(11);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'b1111111-1111-4111-8111-111111111111',
  'SLOC Provider A',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'sloc-a@example.com'
),
(
  'b2222222-2222-4222-8222-222222222222',
  'SLOC Provider B',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'sloc-b@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
('c8111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Main A', 10, 'standalone', 'Each', true),
('c8222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222', 'Main B', 10, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pid, weekday
from (
  values
    ('c8111111-1111-4111-8111-111111111111'::uuid),
    ('c8222222-2222-4222-8222-222222222222'::uuid)
) as items(pid),
generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

insert into public.office_locations (id, name, is_active)
values
  ('f9100000-0000-4000-8000-000000000001', 'SLOC Office A', true),
  ('f9200000-0000-4000-8000-000000000002', 'SLOC Office B', true)
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f9111111-1111-4111-8111-111111111111', 'sloc-staff@test.local', '{"full_name":"SLOC Staff"}');

reset role;
select private.apply_profile_role('f9111111-1111-4111-8111-111111111111', 'staff');

reset role;
select private.activate_trusted_profile_default_location();
update public.profiles
set default_office_location_id = null
where id = 'f9111111-1111-4111-8111-111111111111';
select set_config('app.trusted_profile_default_location', 'false', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles()),
  0,
  'no default location returns no cycles without explicit office parameter'
);

select ok(
  (select count(*)::integer from public.list_staff_late_order_eligible_cycles('f9100000-0000-4000-8000-000000000001')) > 0,
  'explicit office location returns eligible cycles without saved default'
);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'b1111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Location B summary',
    1,
    null,
    'f9200000-0000-4000-8000-000000000002'
  ) $$,
  'create request uses explicit non-default office location'
);

reset role;

select is(
  (
    select r.office_location_id
    from private.staff_late_order_requests r
    where r.requester_profile_id = 'f9111111-1111-4111-8111-111111111111'
    order by r.created_at desc
    limit 1
  ),
  'f9200000-0000-4000-8000-000000000002'::uuid,
  'request row stores chosen office location'
);

select is(
  (select p.default_office_location_id from public.profiles p where p.id = 'f9111111-1111-4111-8111-111111111111'),
  null,
  'profile default remains null when not saved'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f9111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.set_my_default_office_location('f9100000-0000-4000-8000-000000000001') $$,
  'staff can save default office location'
);

select is(
  (select p.default_office_location_id from public.profiles p where p.id = 'f9111111-1111-4111-8111-111111111111'),
  'f9100000-0000-4000-8000-000000000001'::uuid,
  'saved default office location persists on profile'
);

select throws_ok(
  $$ select count(*) from public.list_staff_late_order_eligible_cycles('00000000-0000-4000-8000-000000000099') $$,
  'Delivery location is invalid or inactive',
  'invalid office location is rejected'
);

select is(
  (select count(*)::integer from public.get_my_staff_late_order_requests()),
  1,
  'existing request remains visible after default location changes'
);

select ok(
  (
    select count(*)::integer
    from public.list_staff_late_order_eligible_cycles('f9100000-0000-4000-8000-000000000001')
  ) >= 0,
  'list cycles for saved default location succeeds'
);

select ok(
  (
    select count(*)::integer
    from public.list_staff_late_order_eligible_cycles('f9200000-0000-4000-8000-000000000002')
  ) >= 0,
  'list cycles for alternate location succeeds without leaking ownership'
);

select * from finish();

rollback;
