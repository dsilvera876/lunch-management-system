begin;

select plan(19);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'a1111111-1111-4111-8111-111111111111',
  'late-hr@test.local',
  '{"full_name":"Late HR"}'
),
(
  'a2222222-2222-4222-8222-222222222222',
  'late-staff@test.local',
  '{"full_name":"Late Staff"}'
),
(
  'a3333333-3333-4333-8333-333333333333',
  'late-accounts@test.local',
  '{"full_name":"Late Accounts"}'
);

reset role;
select private.apply_profile_role('a1111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('a2222222-2222-4222-8222-222222222222', 'staff');
select private.apply_profile_role('a3333333-3333-4333-8333-333333333333', 'accounts');

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values
(
  'b1111111-1111-4111-8111-111111111111',
  'Late Provider A',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  'kitchen-a@example.com'
),
(
  'b2222222-2222-4222-8222-222222222222',
  'Late Provider B',
  true,
  false,
  null,
  null,
  'manual',
  null
),
(
  'b3333333-3333-4333-8333-333333333333',
  'Late Provider C',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  'kitchen-c@example.com'
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
(
  'c1111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'Late Main',
  10.00,
  'standalone',
  'Each',
  true
),
(
  'c2222222-2222-4222-8222-222222222222',
  'b3333333-3333-4333-8333-333333333333',
  'Provider C Main',
  10.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select item_id, weekday
from (
  values
    ('c1111111-1111-4111-8111-111111111111'::uuid),
    ('c2222222-2222-4222-8222-222222222222'::uuid)
) as items(item_id)
cross join generate_series(1, 5) as weekday;

\ir support/open_ordering.inc

do $$
declare
  v_today date := private.jamaica_today_date();
  v_order_date date;
  v_delivery_date date;
  v_past_order_date date;
begin
  select candidate.order_date
  into v_order_date
  from (
    select (v_today - offs) as order_date
    from generate_series(1, 7) as offs
  ) candidate
  where public.delivery_date_for_order_date(candidate.order_date) >= v_today
  order by candidate.order_date desc
  limit 1;

  v_delivery_date := public.delivery_date_for_order_date(v_order_date);

  select candidate.order_date
  into v_past_order_date
  from (
    select (v_today - offs) as order_date
    from generate_series(1, 7) as offs
  ) candidate
  where public.iso_weekday(candidate.order_date) is not null
    and candidate.order_date < v_today
  order by candidate.order_date desc
  limit 1;

  perform set_config('test.jamaica_today', v_today::text, false);
  perform set_config('test.late_order_date', v_order_date::text, false);
  perform set_config('test.late_delivery_date', v_delivery_date::text, false);
  perform set_config('test.past_order_date', v_past_order_date::text, false);
end;
$$;

select lives_ok(
  $$
    select public.materialize_provider_snapshots_for_order_date(
      private.jamaica_today_date()
    )
  $$,
  'Current-day provider snapshots may be materialized safely'
);

select throws_ok(
  $$
    select public.materialize_provider_snapshots_for_order_date(
      private.jamaica_today_date() - 1
    )
  $$,
  'Provider snapshots may only be materialized for the current Jamaica order date',
  'Past-day materialization is rejected'
);

delete from public.menu_items
where lunch_day_id in (
  select id
  from public.lunch_days
  where provider_id = 'b3333333-3333-4333-8333-333333333333'
    and order_date = private.jamaica_today_date()
);

delete from public.lunch_days
where provider_id = 'b3333333-3333-4333-8333-333333333333'
  and order_date = private.jamaica_today_date();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b3333333-3333-4333-8333-333333333333',
      current_setting('test.jamaica_today')::date,
      '{"meal_quantity":null,"main_provider_menu_item_id":null,"side_provider_menu_item_ids":[],"standalone_items":[{"provider_menu_item_id":"c2222222-2222-4222-8222-222222222222","quantity":1}]}'::jsonb,
      null
    )
  $$,
  'Normal staff order creates and uses the current-day provider snapshot'
);

reset role;

select ok(
  (
    select private.ensure_provider_lunch_day(
      'b1111111-1111-4111-8111-111111111111',
      private.jamaica_today_date()
    ) is not null
  ),
  'Normal current-day lazy snapshot creation remains available'
);

select lives_ok(
  $$
    select private.ensure_provider_lunch_day(
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_order_date')::date
    )
  $$,
  'Setup frozen snapshot for the late-order cycle (simulates order-day freeze)'
);

update public.provider_menu_items
set name = 'Changed Recurring Name'
where id = 'c1111111-1111-4111-8111-111111111111';

select results_eq(
  $$
    select mi.name
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and ld.order_date = current_setting('test.late_order_date')::date
    order by mi.name
    limit 1
  $$,
  array['Late Main'::text],
  'Frozen snapshot menu is unchanged after recurring menu edits'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.create_hr_late_order(
      'a2222222-2222-4222-8222-222222222222',
      'b3333333-3333-4333-8333-333333333333',
      current_setting('test.late_delivery_date')::date,
      jsonb_build_object(
        'standalone_items', jsonb_build_array(
          jsonb_build_object('menu_item_id', '00000000-0000-4000-8000-000000000001', 'quantity', 1)
        )
      ),
      null,
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'The menu snapshot for this provider and order date is unavailable.',
  'Historical late order without a frozen snapshot is rejected'
);

select throws_ok(
  $$
    select public.create_hr_late_order(
      'a2222222-2222-4222-8222-222222222222',
      'b2222222-2222-4222-8222-222222222222',
      current_setting('test.late_delivery_date')::date,
      jsonb_build_object(
        'standalone_items', jsonb_build_array(
          jsonb_build_object('menu_item_id', '00000000-0000-4000-8000-000000000001', 'quantity', 1)
        )
      ),
      null,
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'Provider does not accept late orders',
  'Provider-disabled late orders are rejected'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.create_hr_late_order(
      'a2222222-2222-4222-8222-222222222222',
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      jsonb_build_object(
        'standalone_items', jsonb_build_array(
          jsonb_build_object('menu_item_id', '00000000-0000-4000-8000-000000000001', 'quantity', 1)
        )
      ),
      null,
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'HR late-order access required',
  'Staff cannot create HR late orders'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.create_hr_late_order(
      'a2222222-2222-4222-8222-222222222222',
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      jsonb_build_object(
        'standalone_items', jsonb_build_array(
          jsonb_build_object('menu_item_id', '00000000-0000-4000-8000-000000000001', 'quantity', 1)
        )
      ),
      null,
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'HR late-order access required',
  'Accounts cannot create HR late orders'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    update public.lunch_providers
    set automatic_supplement_send_day = 'delivery_day',
        automatic_supplement_send_time = '23:59:00',
        late_order_deadline_day = 'delivery_day',
        late_order_deadline_time = '10:00:00',
        supplemental_dispatch_mode = 'automatic',
        accepts_late_orders = true
    where id = 'b1111111-1111-4111-8111-111111111111'
  $$,
  'Automatic supplement send time must be on or before the late-order deadline',
  'Automatic send after provider deadline is rejected'
);

select lives_ok(
  $$
    select public.create_hr_late_order(
      'a2222222-2222-4222-8222-222222222222',
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object(
              'menu_item_id',
              mi.id,
              'quantity',
              1
            )
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.late_order_date')::date
        limit 1
      ),
      'Late order note',
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'Late order uses an existing frozen snapshot rather than reconstructing recurring menu'
);

select results_eq(
  $$
    select mi.name
    from public.order_items oi
    join public.menu_items mi on mi.id = oi.menu_item_id
    join public.orders o on o.id = oi.order_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and o.is_late_order = true
    order by o.created_at desc
    limit 1
  $$,
  array['Late Main'::text],
  'Late order item names come from the frozen snapshot, not the changed recurring menu'
);

select ok(
  (
    select ld.order_date = current_setting('test.late_order_date')::date
       and ld.lunch_date = current_setting('test.late_delivery_date')::date
       and o.is_late_order
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'a2222222-2222-4222-8222-222222222222'
      and o.is_late_order = true
    order by o.created_at desc
    limit 1
  ),
  'Late order preserves original order date and scheduled delivery date'
);

select ok(
  (
    select public.claim_provider_late_order_supplement(
      'b1111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date
    ) ->> 'dispatch_id'
  ) is not null,
  'Manual supplemental claim returns a pending dispatch'
);

select lives_ok(
  $$
    select public.finalize_provider_late_order_supplement(
      (
        select id
        from public.provider_late_order_dispatches
        where provider_id = 'b1111111-1111-4111-8111-111111111111'
          and status = 'pending'
        order by created_at desc
        limit 1
      ),
      false,
      'Simulated email failure'
    )
  $$,
  'Failed supplemental finalize records failure without dispatch membership'
);

select is_empty(
  $$
    select 1
    from public.provider_late_order_dispatch_orders
  $$,
  'Failed email does not mark late orders as sent'
);

select lives_ok(
  $$
    select public.finalize_provider_late_order_supplement(
      (
        select (public.claim_provider_late_order_supplement(
          'b1111111-1111-4111-8111-111111111111',
          current_setting('test.late_delivery_date')::date
        ) ->> 'dispatch_id')::uuid
      ),
      true,
      null
    )
  $$,
  'Successful supplemental finalize marks claimed late orders as sent'
);

select isnt_empty(
  $$
    select 1
    from public.provider_late_order_dispatch_orders
  $$,
  'Successful dispatch creates membership rows'
);

select * from finish();
rollback;
