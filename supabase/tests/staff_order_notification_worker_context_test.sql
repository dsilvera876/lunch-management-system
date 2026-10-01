begin;

select plan(8);

\ir support/isolate_existing_owner.inc
\ir support/submit_order_lunch_day_fixture.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a8111111-1111-4111-8111-111111111111', 'worker-ctx-staff@test.local', '{"full_name":"Worker Ctx Staff"}'),
  ('a8222222-2222-4222-8222-222222222222', 'worker-ctx-hr@test.local', '{"full_name":"Worker Ctx HR"}');

reset role;
select private.apply_profile_role('a8111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('a8222222-2222-4222-8222-222222222222', 'hr');

\ir support/open_ordering.inc

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select public.set_my_notification_preference('staff.order_submitted', true);
select public.set_my_notification_preference('staff.order_changed', true);
select public.set_my_notification_preference('staff.order_cancelled', true);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
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

do $$
declare
  v_order_id uuid;
begin
  select id
  into v_order_id
  from public.orders
  where profile_id = 'a8111111-1111-4111-8111-111111111111'
  order by created_at desc
  limit 1;

  perform set_config('test.worker_ctx_order_id', v_order_id::text, false);
end;
$$;

reset role;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (
    select provider_name
    from public.worker_get_staff_order_notification_context(
      current_setting('test.worker_ctx_order_id')::uuid
    )
  ) = 'Submit Order Test Provider',
  'worker_get_staff_order_notification_context returns provider name (lp join)'
);

select ok(
  (
    select order_summary like '%Jerk Chicken%'
    from public.worker_get_staff_order_notification_context(
      current_setting('test.worker_ctx_order_id')::uuid
    )
  ),
  'worker context includes formatted order summary'
);

select ok(
  (
    select order_status = 'submitted'
    from public.worker_get_staff_order_notification_context(
      current_setting('test.worker_ctx_order_id')::uuid
    )
  ),
  'worker context includes order status for staff.order_submitted'
);

reset role;

-- staff.order_changed context (same RPC, order still submitted)
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.replace_order_items(
  current_setting('test.worker_ctx_order_id')::uuid,
  '{
    "meal_quantity": null,
    "main_menu_item_id": null,
    "side_menu_item_ids": [],
    "standalone_items": [
      {"menu_item_id": "20000000-0000-0000-0000-000000000002", "quantity": 1}
    ]
  }'::jsonb,
  null
);

reset role;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (
    select order_summary like '%Curry Chicken%'
    from public.worker_get_staff_order_notification_context(
      current_setting('test.worker_ctx_order_id')::uuid
    )
  ),
  'worker context reflects latest items for staff.order_changed'
);

reset role;

-- staff.order_cancelled: order row remains with cancelled status
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.cancel_order(current_setting('test.worker_ctx_order_id')::uuid);

reset role;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (
    select order_status = 'cancelled'
    from public.worker_get_staff_order_notification_context(
      current_setting('test.worker_ctx_order_id')::uuid
    )
  ),
  'worker context loads cancelled order for staff.order_cancelled'
);

-- staff.changed_by_hr: synthetic pending intent on same order id
reset role;

do $$
declare
  v_delivery_id uuid;
begin
  insert into private.notification_delivery_log (
    event_key,
    profile_id,
    operational_date,
    order_id,
    idempotency_key,
    status
  )
  values (
    'staff.changed_by_hr',
    'a8111111-1111-4111-8111-111111111111',
    '2099-01-01'::date,
    current_setting('test.worker_ctx_order_id')::uuid,
    'staff.changed_by_hr:a8111111-1111-4111-8111-111111111111:worker-ctx-test',
    'pending'
  )
  returning id into v_delivery_id;

  perform set_config('test.worker_ctx_delivery_id', v_delivery_id::text, false);
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (
    select provider_name is not null
    from public.worker_get_staff_order_notification_context(
      current_setting('test.worker_ctx_order_id')::uuid
    )
  ),
  'worker context loads for staff.changed_by_hr delivery shape'
);

select lives_ok(
  $$
    select public.worker_record_notification_render_failure(
      current_setting('test.worker_ctx_delivery_id')::uuid,
      'missing FROM-clause entry for table "lp"'
    )
  $$,
  'Render failure RPC records error without marking transport sent'
);

reset role;

select ok(
  (
    select d.last_error like 'Render failed:%lp%'
    from private.notification_delivery_log d
    where d.id = current_setting('test.worker_ctx_delivery_id')::uuid
  ),
  'Render failure visible on pending delivery for admin monitoring'
);

select * from finish();
rollback;
