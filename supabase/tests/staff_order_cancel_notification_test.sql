begin;

select plan(5);

\ir support/isolate_existing_owner.inc
\ir support/open_ordering.inc

insert into auth.users (id, email, raw_user_meta_data)
values (
  'b1111111-1111-4111-8111-111111111111',
  'cancel-notify-staff@test.local',
  '{"full_name":"Cancel Notify Staff"}'
);

select private.apply_profile_role('b1111111-1111-4111-8111-111111111111', 'staff');

\ir support/assign_test_office_defaults.inc

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email)
values
  ('b0111111-1111-4111-8111-111111111111', 'Cancel Provider Alpha', true, 'alpha-cancel@example.test'),
  ('b0222222-2222-4222-8222-222222222222', 'Cancel Provider Beta', true, 'beta-cancel@example.test')
on conflict (id) do update set active = excluded.active;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('b1011111-1111-4111-8111-111111111111', 'b0111111-1111-4111-8111-111111111111', 'Alpha Meal', 10.00, 'standalone', 'Each', true),
  ('b1022222-2222-4222-8222-222222222222', 'b0222222-2222-4222-8222-222222222222', 'Beta Meal', 11.00, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('b1011111-1111-4111-8111-111111111111', 1),
  ('b1022222-2222-4222-8222-222222222222', 1)
on conflict do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.set_my_notification_preference('staff.order_cancelled', true);

select public.submit_provider_checkout(
  '2099-01-05'::date,
  'f0000000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'provider_id', 'b0111111-1111-4111-8111-111111111111',
      'items', jsonb_build_object(
        'meal_quantity', null,
        'main_provider_menu_item_id', null,
        'side_provider_menu_item_ids', '[]'::jsonb,
        'standalone_items', jsonb_build_array(
          jsonb_build_object('provider_menu_item_id', 'b1011111-1111-4111-8111-111111111111', 'quantity', 1)
        )
      ),
      'special_instructions', null
    ),
    jsonb_build_object(
      'provider_id', 'b0222222-2222-4222-8222-222222222222',
      'items', jsonb_build_object(
        'meal_quantity', null,
        'main_provider_menu_item_id', null,
        'side_provider_menu_item_ids', '[]'::jsonb,
        'standalone_items', jsonb_build_array(
          jsonb_build_object('provider_menu_item_id', 'b1022222-2222-4222-8222-222222222222', 'quantity', 1)
        )
      ),
      'special_instructions', null
    )
  )
);

select public.cancel_order(
  (
    select o.id
    from public.orders o
    inner join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'b1111111-1111-4111-8111-111111111111'
      and ld.provider_id = 'b0111111-1111-4111-8111-111111111111'
    limit 1
  )
);

reset role;

do $$
declare
  v_order_id uuid;
begin
  select d.order_id
  into v_order_id
  from private.notification_delivery_log d
  where d.event_key = 'staff.order_cancelled'
    and d.profile_id = 'b1111111-1111-4111-8111-111111111111'
  order by d.created_at desc
  limit 1;

  perform set_config('test.cancel_notify_order_id', v_order_id::text, false);
end;
$$;

select ok(
  (
    select t.body_text_template like '%{{provider_name}}%'
      and t.body_text_template like '%Other lunch orders for this day were not affected.%'
      and t.body_text_template not like '%all of your lunch orders%'
    from private.notification_email_templates t
    where t.event_key = 'staff.order_cancelled'
  ),
  'cancel email template identifies provider and clarifies other same-day orders remain'
);

select is(
  (
    select count(*)::integer
    from private.notification_delivery_log d
    where d.event_key = 'staff.order_cancelled'
      and d.profile_id = 'b1111111-1111-4111-8111-111111111111'
  ),
  1,
  'cancelling one provider order creates one cancellation notification'
);

select is(
  (
    select count(*)::integer
    from public.orders o
    inner join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'b1111111-1111-4111-8111-111111111111'
      and o.status = 'submitted'
  ),
  1,
  'another same-day provider order remains submitted'
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$
    select provider_name
    from public.worker_get_staff_order_notification_context(
      current_setting('test.cancel_notify_order_id')::uuid
    )
  $$,
  array['Cancel Provider Alpha'::text],
  'cancellation notification context names the cancelled provider'
);

select isnt_empty(
  $$
    select order_summary
    from public.worker_get_staff_order_notification_context(
      current_setting('test.cancel_notify_order_id')::uuid
    )
  $$,
  'cancellation notification context includes order summary'
);

select * from finish();

rollback;
