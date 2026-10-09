begin;

select plan(12);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'hr-mut-staff@test.local', '{"full_name":"HR Mut Staff"}'),
  ('22222222-2222-4222-8222-222222222222', 'hr-mut-hr@test.local', '{"full_name":"HR Mut HR"}'),
  ('33333333-3333-4333-8333-333333333333', 'hr-mut-accounts@test.local', '{"full_name":"HR Mut Accounts"}'),
  ('44444444-4444-4444-8444-444444444444', 'hr-mut-admin@test.local', '{"full_name":"HR Mut Admin"}');

reset role;

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email)
values ('88888888-8888-4888-8888-888888888888', 'HR Mut Provider', true, 'provider+hrmut@example.test');

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('a1111111-1111-4111-8111-111111111111', '88888888-8888-4888-8888-888888888888', 'Fried Chicken', 12.00, 'main', 'Each', true),
  ('a2222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'Rice & Peas', 3.00, 'side', 'Each', true),
  ('a3333333-3333-4333-8333-333333333333', '88888888-8888-4888-8888-888888888888', 'BBQ Chicken', 13.00, 'main', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pmi.id, gs.wd
from public.provider_menu_items pmi
cross join generate_series(1, 5) as gs(wd)
where pmi.provider_id = '88888888-8888-4888-8888-888888888888'
on conflict do nothing;

update public.app_settings set order_cutoff_time = '00:00:01' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('HR Mut Payroll', '2099-01-01', '2099-01-31');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  null,
  'f0000000-0000-4000-8000-000000000001'
);

reset role;

do $$
declare
  v_order_id uuid;
  v_lunch_day_id uuid;
  v_main_menu uuid;
  v_alt_main_menu uuid;
  v_side_menu uuid;
begin
  select o.id, o.lunch_day_id
  into v_order_id, v_lunch_day_id
  from public.orders o
  where o.profile_id = '11111111-1111-4111-8111-111111111111'
  order by o.created_at desc
  limit 1;

  select mi.id into v_main_menu
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id and mi.name = 'Fried Chicken'
  limit 1;

  select mi.id into v_alt_main_menu
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id and mi.name = 'BBQ Chicken'
  limit 1;

  select mi.id into v_side_menu
  from public.menu_items mi
  where mi.lunch_day_id = v_lunch_day_id and mi.item_type = 'side'
  limit 1;

  perform set_config('test.hr_mut_order_id', v_order_id::text, false);
  perform set_config('test.hr_mut_lunch_day_id', v_lunch_day_id::text, false);
  perform set_config('test.hr_mut_main_menu_id', v_main_menu::text, false);
  perform set_config('test.hr_mut_alt_main_menu_id', v_alt_main_menu::text, false);
  perform set_config('test.hr_mut_side_menu_id', v_side_menu::text, false);
end;
$$;

select ok(
  current_setting('test.hr_mut_order_id', true) is not null,
  'fixture order created'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    '{}'::jsonb,
    'reason',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_order_id')::uuid)
  ) $$,
  'P0001',
  'HR operational mutation access required',
  'non-HR staff cannot HR modify'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hr_cancel_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    'reason',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_order_id')::uuid)
  ) $$,
  'P0001',
  'HR operational mutation access required',
  'admin cannot HR cancel without HR role'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_menu_item_id', current_setting('test.hr_mut_main_menu_id')::uuid,
      'side_menu_item_ids', jsonb_build_array(current_setting('test.hr_mut_side_menu_id')::uuid),
      'standalone_items', '[]'::jsonb
    ),
    '   ',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_order_id')::uuid)
  ) $$,
  'P0001',
  'A reason is required for HR order changes',
  'blank HR reason rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_menu_item_id', current_setting('test.hr_mut_alt_main_menu_id')::uuid,
      'side_menu_item_ids', jsonb_build_array(current_setting('test.hr_mut_side_menu_id')::uuid),
      'standalone_items', '[]'::jsonb
    ),
    'Switch to BBQ',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_order_id')::uuid)
  ) $$,
  'HR modifies order items'
);

reset role;

select ok(
  (
    select count(*) = 1
    from private.hr_staff_order_mutation_events e
    where e.order_id = current_setting('test.hr_mut_order_id')::uuid
      and e.action = 'modified'
      and e.actor_id = '22222222-2222-4222-8222-222222222222'
      and e.subject_profile_id = '11111111-1111-4111-8111-111111111111'
  ),
  'audit row written for modify'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

reset role;

select ok(
  (
    select count(*) = 1
    from private.order_notification_lifecycle l
    where l.order_id = current_setting('test.hr_mut_order_id')::uuid
      and l.event_key = 'staff.changed_by_hr'
  ),
  'staff.changed_by_hr lifecycle recorded once after modify'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_menu_item_id', current_setting('test.hr_mut_alt_main_menu_id')::uuid,
      'side_menu_item_ids', jsonb_build_array(current_setting('test.hr_mut_side_menu_id')::uuid),
      'standalone_items', '[]'::jsonb
    ),
    'Still the same',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_order_id')::uuid)
  ) $$,
  'P0001',
  'No changes were made to the order',
  'no-op modify rejected'
);

select throws_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_menu_item_id', current_setting('test.hr_mut_alt_main_menu_id')::uuid,
      'side_menu_item_ids', jsonb_build_array(current_setting('test.hr_mut_side_menu_id')::uuid),
      'standalone_items', '[]'::jsonb
    ),
    'Stale',
    timestamptz '2000-01-01 00:00:00+00'
  ) $$,
  'P0001',
  'Order changed; refresh and try again',
  'stale expected_updated_at rejected'
);

select lives_ok(
  $$ select public.hr_cancel_staff_order(
    current_setting('test.hr_mut_order_id')::uuid,
    'Employee called in sick',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_order_id')::uuid)
  ) $$,
  'HR cancel succeeds'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-16'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  null,
  'f0000000-0000-4000-8000-000000000001'
);

reset role;

update public.orders
set
  is_late_order = true,
  late_order_created_by = '22222222-2222-4222-8222-222222222222',
  late_order_approved_at = now(),
  late_order_approved_by = '22222222-2222-4222-8222-222222222222'
where id = (
  select o.id
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.profile_id = '11111111-1111-4111-8111-111111111111'
    and ld.order_date = '2099-01-16'::date
  limit 1
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.cancel_order(
    (select o.id from public.orders o where o.profile_id = '11111111-1111-4111-8111-111111111111' and o.is_late_order = true limit 1)
  ) $$,
  'P0001',
  'Late orders cannot be cancelled through self-service',
  'staff cancel_order rejects late order'
);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-23'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  null,
  'f0000000-0000-4000-8000-000000000001'
);

reset role;

do $$
declare
  v_order_id uuid;
  v_delivery date;
begin
  select o.id, ld.lunch_date
  into v_order_id, v_delivery
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.profile_id = '11111111-1111-4111-8111-111111111111'
    and ld.order_date = '2099-01-23'::date
  limit 1;

  insert into public.provider_primary_order_dispatches (
    provider_id,
    scheduled_delivery_date,
    dispatch_type,
    status,
    sent_at,
    message_metadata
  )
  values (
    '88888888-8888-4888-8888-888888888888',
    v_delivery,
    'manual',
    'sent',
    now(),
    jsonb_build_object('order_ids', jsonb_build_array(v_order_id))
  );

  perform set_config('test.hr_mut_dispatch_order_id', v_order_id::text, false);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hr_cancel_staff_order(
    current_setting('test.hr_mut_dispatch_order_id')::uuid,
    'Too late',
    (select updated_at from public.orders where id = current_setting('test.hr_mut_dispatch_order_id')::uuid)
  ) $$,
  'P0001',
  'Provider primary order dispatch already sent',
  'HR cancel blocked after primary dispatch sent'
);

select * from finish();
rollback;
