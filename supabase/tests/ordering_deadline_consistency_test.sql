begin;

select plan(12);

\ir support/reset_app_settings_baseline.inc

update public.app_settings
set order_cutoff_time = '18:00:00'
where id = 1;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c1111111-1111-4111-8111-111111111111', 'deadline-staff@test.local', '{"full_name":"Deadline Staff"}'),
  ('c1222222-2222-4222-8222-222222222222', 'deadline-hr@test.local', '{"full_name":"Deadline HR"}');

reset role;
select private.apply_profile_role('c1111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('c1222222-2222-4222-8222-222222222222', 'hr');

\ir support/open_ordering.inc

insert into auth.users (id, email, raw_user_meta_data)
values (
  'c1999999-9999-4999-8999-999999999999',
  'deadline-admin@test.local',
  '{"full_name":"Deadline Admin"}'
)
on conflict (id) do nothing;

reset role;
select private.apply_profile_role('c1999999-9999-4999-8999-999999999999', 'admin');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1999999-9999-4999-8999-999999999999', 'role', 'authenticated')::text,
  true
);
select public.update_notification_global_setting('staff.today_menu', true, time '08:00', null);
select public.update_notification_global_setting('staff.order_submitted', true, null, null);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select public.set_my_notification_preference('staff.today_menu', true);
select public.set_my_notification_preference('staff.order_submitted', true);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);
select public.set_my_notification_preference('staff.order_submitted', true);
reset role;

-- 2099-01-05 is Monday; delivery lunch_date is 2099-01-06.

insert into public.lunch_providers (id, name, active)
values (
  'c9000000-0000-0000-0000-000000000099',
  'Deadline Consistency Provider',
  true
);

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
  'c9111111-1111-4111-8111-111111111111',
  'c9000000-0000-0000-0000-000000000099',
  'Deadline Bowl',
  10.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values ('c9111111-1111-4111-8111-111111111111', 1);

-- Drifted snapshot: delivery row exists but order_date is not the active checkout date.
insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'c1000000-0000-0000-0000-000000000001',
  public.delivery_date_for_order_date('2099-01-05'::date),
  '2099-01-04'::date,
  'c9000000-0000-0000-0000-000000000099',
  public.order_deadline_for_order_date('2099-01-04'::date),
  'open'
);

insert into public.menu_items (
  id,
  lunch_day_id,
  provider_menu_item_id,
  name,
  price,
  item_type,
  unit_label,
  is_active
)
values (
  'c2000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c9111111-1111-4111-8111-111111111111',
  'Deadline Bowl',
  10.00,
  'standalone',
  'Each',
  true
);

select ok(
  public.is_before_order_deadline(
    '2099-01-05'::date,
    public.order_deadline_for_order_date('2099-01-05'::date) - interval '1 minute'
  ),
  'One minute before canonical deadline is still open'
);

select ok(
  not public.is_before_order_deadline(
    '2099-01-05'::date,
    public.order_deadline_for_order_date('2099-01-05'::date) + interval '1 second'
  ),
  'One second after canonical deadline is closed'
);

select ok(
  (
    select s.is_open
    from public.get_self_service_ordering_state(
      '2099-01-05'::date,
      null,
      public.order_deadline_for_order_date('2099-01-05'::date) - interval '1 minute'
    ) s
  ),
  'Self-service ordering state open matches deadline helper before cutoff'
);

select ok(
  not (
    select s.is_open
    from public.get_self_service_ordering_state(
      '2099-01-05'::date,
      null,
      public.order_deadline_for_order_date('2099-01-05'::date) + interval '1 second'
    ) s
  ),
  'Self-service ordering state closed after cutoff'
);

select results_eq(
  $$
    select to_char(
      public.effective_order_deadline('c1000000-0000-0000-0000-000000000001')
        at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
  $$,
  array[
    to_char(
      public.order_deadline_for_order_date('2099-01-05'::date)
        at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
  ],
  'Effective provider deadline follows delivery calendar, not drifted lunch_days.order_date'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'c9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"c9111111-1111-4111-8111-111111111111","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'Staff can submit before deadline when reusing drifted lunch_day row'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'c9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"c9111111-1111-4111-8111-111111111111","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'HR can submit before deadline on the same normal self-service path'
);

reset role;

select is(
  (
    select order_date
    from public.lunch_days
    where id = 'c1000000-0000-0000-0000-000000000001'
  ),
  '2099-01-05'::date,
  'Checkout canonicalizes drifted lunch_days.order_date to active order date'
);

select ok(
  (
    select eligible
    from private.today_menu_recipient_eligible(
      'c1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      public.order_deadline_for_order_date('2099-01-05'::date) - interval '1 minute'
    )
  ),
  'Today''s Menu eligibility open before deadline via shared ordering state'
);

select ok(
  not (
    select eligible
    from private.today_menu_recipient_eligible(
      'c1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      public.order_deadline_for_order_date('2099-01-05'::date) + interval '1 second'
    )
  ),
  'Today''s Menu eligibility closed after deadline via shared ordering state'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'c9000000-0000-0000-0000-000000000099',
      '2099-01-05'::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[]}'::jsonb,
      null
    )
  $$,
  'Order must contain at least one item',
  'Failed validation creates no order (deadline path still uses same RPC guard ordering)'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'c1222222-2222-4222-8222-222222222222'
  ),
  1,
  'Successful HR submit creates one notification intent; failed empty submit adds none'
);

select * from finish();
rollback;
