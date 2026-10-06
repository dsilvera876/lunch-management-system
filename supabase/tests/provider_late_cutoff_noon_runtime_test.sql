begin;
select plan(12);

insert into public.lunch_providers (
  id,
  name,
  active,
  accepts_late_orders,
  late_order_deadline_day,
  late_order_deadline_time,
  supplemental_dispatch_mode,
  primary_order_email
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'Legacy Noon Cap Runtime Provider',
  true,
  true,
  'delivery_day',
  '11:59:00',
  'manual',
  'legacy-noon-runtime@example.com'
)
on conflict (id) do update set
  accepts_late_orders = excluded.accepts_late_orders,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time,
  primary_order_email = excluded.primary_order_email;

alter table public.lunch_providers disable trigger validate_provider_late_order_settings;

update public.lunch_providers
set late_order_deadline_time = '21:00:00'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

alter table public.lunch_providers enable trigger validate_provider_late_order_settings;

select is(
  (select late_order_deadline_time::text
   from public.lunch_providers
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),
  '21:00:00',
  'stored provider configuration remains 21:00 until HR fixes it'
);

select is(
  private.effective_late_order_deadline_time('delivery_day', time '21:00:00')::text,
  '12:00:00',
  'effective deadline time caps legacy delivery_day 21:00 to noon'
);

select is(
  (select public.provider_late_order_deadline_at(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
    date '2099-06-10',
    date '2099-06-10'
  ) at time zone 'America/Jamaica')::time::text,
  '12:00:00',
  'provider_late_order_deadline_at uses noon cap at runtime'
);

select cmp_ok(
  (select public.provider_late_order_deadline_at(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
    date '2099-06-10',
    date '2099-06-10'
  )),
  '>',
  timestamptz '2099-06-10 11:59:00-05',
  'deadline remains after 11:59 on delivery date'
);

select cmp_ok(
  timestamptz '2099-06-10 12:00:01-05',
  '>',
  (select public.provider_late_order_deadline_at(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
    date '2099-06-10',
    date '2099-06-10'
  )),
  'requests after effective noon deadline are past provider cutoff'
);

select cmp_ok(
  (select public.provider_late_order_deadline_at(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
    date '2099-06-10',
    date '2099-06-10'
  )),
  '>=',
  timestamptz '2099-06-10 12:00:00-05',
  'exactly 12:00 PM remains within effective deadline'
);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values (
  'ec111111-1111-4111-8111-111111111111',
  'legacy-noon-staff@test.local',
  '{"full_name":"Legacy Noon Staff"}'
)
on conflict (id) do nothing;

reset role;
select private.apply_profile_role('ec111111-1111-4111-8111-111111111111', 'staff');

insert into public.office_locations (id, name, is_active)
values ('ec900000-0000-4000-8000-000000000001', 'Legacy Noon Office', true)
on conflict (id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.set_my_default_office_location('ec900000-0000-4000-8000-000000000001') $$,
  'Legacy noon staff sets default office location'
);

reset role;

select lives_ok(
  $$
    select private.assert_staff_late_order_request_window(
      'ec111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
      date '2099-06-10',
      timestamptz '2099-06-10 11:59:00-05'
    )
  $$,
  'assert_staff allows legacy provider at 11:59 with noon runtime cap'
);

select lives_ok(
  $$
    select private.assert_staff_late_order_request_window(
      'ec111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
      date '2099-06-10',
      timestamptz '2099-06-10 12:00:00-05'
    )
  $$,
  'assert_staff allows request exactly at effective noon deadline'
);

select throws_ok(
  $$
    select private.assert_staff_late_order_request_window(
      'ec111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid,
      date '2099-06-10',
      timestamptz '2099-06-10 12:00:01-05'
    )
  $$,
  'Provider late-order deadline has passed',
  'assert_staff blocks legacy provider after effective noon'
);

select throws_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_time = '21:00:00'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
  $$,
  'The late-order cutoff cannot be later than 12:00 PM on the delivery date.',
  'save-time validation still rejects delivery_day 21:00'
);

select lives_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_time = '12:00:00'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
  $$,
  'HR can persist a valid noon delivery-day cutoff'
);

select * from finish();
rollback;
