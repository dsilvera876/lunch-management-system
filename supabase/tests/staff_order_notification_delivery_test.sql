begin;

select plan(14);

\ir support/isolate_existing_owner.inc
\ir support/submit_order_lunch_day_fixture.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'order-notify-staff@test.local', '{"full_name":"Order Staff"}'),
  ('a1222222-2222-4222-8222-222222222222', 'order-notify-hr@test.local', '{"full_name":"Order HR"}'),
  ('a1333333-3333-4333-8333-333333333333', 'order-notify-admin@test.local', '{"full_name":"Order Admin"}');

select private.apply_profile_role('a1111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('a1222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('a1333333-3333-4333-8333-333333333333', 'admin');

\ir support/assign_test_office_defaults.inc

reset role;

select ok(
  not coalesce(
    (
      select t.body_html_template like '%Jamaica time%'
      from private.notification_email_templates t
      where t.event_key = 'staff.today_menu'
    ),
    false
  ),
  'Today''s Menu default template no longer contains Jamaica time wording'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.submit_order(
  '10000000-0000-0000-0000-000000000001',
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
    ]
  }'::jsonb
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'Order submitted creates one delivery intent for eligible staff recipient'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);
select public.update_notification_global_setting('staff.order_submitted', false, null, null);
reset role;

select lives_ok(
  $$
    select private.notify_staff_order_event(
      'staff.order_submitted',
      (
        select id
        from public.orders
        where profile_id = 'a1111111-1111-4111-8111-111111111111'
        order by created_at desc
        limit 1
      )
    )
  $$,
  'Global OFF allows order path to continue without raising'
);

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'Global OFF suppresses additional order submitted notifications'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);
select public.update_notification_global_setting('staff.order_submitted', true, null, null);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select public.set_my_notification_preference('staff.order_changed', true);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.replace_order_items(
  (
    select id
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and status = 'submitted'
    order by created_at desc
    limit 1
  ),
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000002", "quantity": 2}
    ]
  }'::jsonb,
  null
);

select public.replace_order_items(
  (
    select id
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and status = 'submitted'
    order by created_at desc
    limit 1
  ),
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000002", "quantity": 2}
    ]
  }'::jsonb,
  null
);

select public.replace_order_items(
  (
    select id
    from public.orders
    where profile_id = 'a1111111-1111-4111-8111-111111111111'
      and status = 'submitted'
    order by created_at desc
    limit 1
  ),
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
    ]
  }'::jsonb,
  null
);

reset role;

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_changed'
      and d.profile_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  2,
  'Genuine edits create notifications; identical retry edit does not add a third'
);

select ok(
  private.format_order_email_summary(
    (
      select id
      from public.orders
      where profile_id = 'a1111111-1111-4111-8111-111111111111'
        and status = 'submitted'
      order by created_at desc
      limit 1
    )
  ) like '%×%',
  'Order summary formatting is human-readable'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);
select public.set_my_notification_preference('staff.order_submitted', true);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select public.submit_order(
  '10000000-0000-0000-0000-000000000001',
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}
    ]
  }'::jsonb
);

reset role;

select ok(
  exists (
    select 1
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'a1222222-2222-4222-8222-222222222222'
  ),
  'Active HR lunch participant receives their own order submitted notification'
);

select throws_ok(
  $$
    select private.assert_notification_template_variables(
      'staff.order_submitted',
      'Bad {{unknown_var}}',
      '<p>Hi</p>',
      null
    )
  $$,
  'Unsupported template variables: unknown_var',
  'Unsupported template variables are rejected for staff order events'
);

select ok(
  (
    select count(*)::integer
    from private.notification_processing_run r
    where r.event_key like 'staff.order%'
  ) = 0,
  'Transactional staff order notifications do not create processing-run rows'
);

reset role;

select ok(
  exists (
    select 1
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and d.status = 'pending'
  ),
  'Pending staff order delivery intent exists before worker queue'
);

do $$
declare
  v_delivery_id uuid;
begin
  select d.id
  into v_delivery_id
  from private.notification_delivery_log d
  where d.event_key = 'staff.order_submitted'
    and d.profile_id = 'a1111111-1111-4111-8111-111111111111'
    and d.status = 'pending'
  order by d.created_at
  limit 1;

  perform set_config('test.staff_order_delivery_id', v_delivery_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select public.worker_queue_notification_delivery(
      current_setting('test.staff_order_delivery_id')::uuid,
      'order-notify-staff@test.local',
      'Subject',
      'Text',
      '<p>Html</p>'
    )
  $$,
  'Worker queue RPC stores rendered snapshots and mail correlation'
);

reset role;

select ok(
  (
    select rendered_subject
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_submitted'
      and d.profile_id = 'a1111111-1111-4111-8111-111111111111'
      and d.status = 'queued'
    order by d.created_at
    limit 1
  ) = 'Subject',
  'Delivery log retains rendered subject snapshot'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select ok(
  (
    select total_count >= 1
    from public.get_notification_delivery_dashboard(
      (current_date - 30),
      (current_date + 30)
    )
  ),
  'Dashboard aggregate includes transactional staff order deliveries'
);

select ok(
  exists (
    select 1
    from public.list_notification_delivery_batches(
      (current_date - 30),
      (current_date + 30),
      'staff.order_submitted',
      null,
      50,
      0
    ) b
    where b.recipient_count > 0
  ),
  'Transactional notifications appear in delivery batch history'
);

select * from finish();

rollback;
