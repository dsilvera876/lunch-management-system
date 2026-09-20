begin;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'c1111111-1111-4111-8111-111111111111',
  'checkout-admin@test.local',
  '{"full_name":"Checkout Admin"}'
),
(
  'c2222222-2222-4222-8222-222222222222',
  'checkout-user@test.local',
  '{"full_name":"Checkout User"}'
);

reset role;
select private.apply_profile_role('c1111111-1111-4111-8111-111111111111', 'admin');

\ir support/open_ordering.inc

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'c1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

insert into public.lunch_providers (id, name, active)
values
  ('c0111111-1111-4111-8111-111111111111', 'Checkout Kitchen A', true),
  ('c0222222-2222-4222-8222-222222222222', 'Checkout Kitchen B', true)
on conflict (id) do nothing;

insert into public.provider_menu_items (
  id, provider_id, name, price, item_type, unit_label, active
)
values
  ('c1011111-1111-4111-8111-111111111111', 'c0111111-1111-4111-8111-111111111111', 'Fried Chicken', 12.00, 'main', 'Each', true),
  ('c1022222-2222-4222-8222-222222222222', 'c0111111-1111-4111-8111-111111111111', 'Rice and Peas', 11.00, 'side', 'Each', true),
  ('c1033333-3333-4333-8333-333333333333', 'c0222222-2222-4222-8222-222222222222', 'Orange Juice', 3.00, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('c1011111-1111-4111-8111-111111111111', 1),
  ('c1022222-2222-4222-8222-222222222222', 1),
  ('c1033333-3333-4333-8333-333333333333', 1)
on conflict do nothing;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'c2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select col_is_null('public', 'orders', 'order_group_id', 'order_group_id is nullable for legacy rows');

select is_empty(
  $$
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'one_active_order_per_user_per_lunch_day'
  $$,
  'repeat provider orders are not blocked by one_active_order_per_user_per_lunch_day'
);

create temporary table checkout_runs (
  label text primary key,
  result jsonb not null
);

insert into checkout_runs (label, result)
values (
  'multi',
  public.submit_provider_checkout(
    '2099-01-05'::date,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'provider_id', 'c0111111-1111-4111-8111-111111111111',
        'items', jsonb_build_object(
          'meal_quantity', 1,
          'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
          'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
          'standalone_items', '[]'::jsonb
        ),
        'special_instructions', 'Extra gravy'
      ),
      jsonb_build_object(
        'provider_id', 'c0222222-2222-4222-8222-222222222222',
        'items', jsonb_build_object(
          'meal_quantity', null,
          'main_provider_menu_item_id', null,
          'side_provider_menu_item_ids', '[]'::jsonb,
          'standalone_items', jsonb_build_array(
            jsonb_build_object(
              'provider_menu_item_id', 'c1033333-3333-4333-8333-333333333333',
              'quantity', 2
            )
          )
        ),
        'special_instructions', null
      )
    )
  )
);

select isnt(
  (select result ->> 'order_group_id' from checkout_runs where label = 'multi'),
  null,
  'multi-provider checkout assigns a non-null order_group_id'
);

select results_eq(
  $$
    select count(*)
    from public.orders o
    where o.profile_id = 'c2222222-2222-4222-8222-222222222222'
      and o.order_group_id = (
        select (result ->> 'order_group_id')::uuid
        from checkout_runs
        where label = 'multi'
      )
  $$,
  array[2::bigint],
  'multi-provider checkout creates two orders with the same order_group_id'
);

insert into checkout_runs (label, result)
values (
  'single',
  public.submit_provider_checkout(
    '2099-01-05'::date,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'provider_id', 'c0111111-1111-4111-8111-111111111111',
        'items', jsonb_build_object(
          'meal_quantity', 1,
          'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
          'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
          'standalone_items', '[]'::jsonb
        ),
        'special_instructions', null
      )
    )
  )
);

select isnt(
  (
    select o.order_group_id::text
    from public.orders o
    where o.id = (
      select ((result -> 'order_ids' ->> 0)::uuid)
      from checkout_runs
      where label = 'single'
    )
  ),
  null,
  'single-provider checkout still assigns order_group_id'
);

select is(
  (
    select jsonb_array_length(result -> 'order_ids')
    from (
      select public.submit_provider_checkout(
        '2099-01-05'::date,
        'f0000000-0000-4000-8000-000000000001'::uuid,
        jsonb_build_array(
          jsonb_build_object(
            'provider_id', 'c0111111-1111-4111-8111-111111111111',
            'items', jsonb_build_object(
              'meal_quantity', 1,
              'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
              'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
              'standalone_items', '[]'::jsonb
            ),
            'special_instructions', 'First meal'
          ),
          jsonb_build_object(
            'provider_id', 'c0111111-1111-4111-8111-111111111111',
            'items', jsonb_build_object(
              'meal_quantity', 1,
              'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
              'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
              'standalone_items', '[]'::jsonb
            ),
            'special_instructions', 'Second meal'
          )
        )
      ) as result
    ) repeat_same_provider_count
  ),
  2,
  'repeat provider checkout returns two order ids'
);

select throws_like(
  $$
    select public.submit_provider_checkout(
      '2099-01-05'::date,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'provider_id', 'c0111111-1111-4111-8111-111111111111',
          'items', jsonb_build_object(
            'meal_quantity', 1,
            'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
            'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
            'standalone_items', '[]'::jsonb
          ),
          'special_instructions', null
        ),
        jsonb_build_object(
          'provider_id', 'c0222222-2222-4222-8222-222222222222',
          'items', jsonb_build_object(
            'meal_quantity', 1,
            'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
            'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
            'standalone_items', '[]'::jsonb
          ),
          'special_instructions', null
        )
      )
    )
  $$,
  '%Menu item % for provider % is invalid or inactive%',
  'invalid second provider rolls back the entire checkout'
);

select results_eq(
  $$
    select count(*)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'c2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'c0111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-05'::date
      and o.status = 'submitted'
  $$,
  array[4::bigint],
  'failed mixed checkout does not leave a partial provider A order behind'
);

insert into checkout_runs (label, result)
values (
  'repeat_one',
  public.submit_provider_checkout(
    '2099-01-05'::date,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'provider_id', 'c0111111-1111-4111-8111-111111111111',
        'items', jsonb_build_object(
          'meal_quantity', 1,
          'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
          'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
          'standalone_items', '[]'::jsonb
        ),
        'special_instructions', 'Checkout one'
      )
    )
  )
);

insert into checkout_runs (label, result)
values (
  'repeat_two',
  public.submit_provider_checkout(
    '2099-01-05'::date,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'provider_id', 'c0111111-1111-4111-8111-111111111111',
        'items', jsonb_build_object(
          'meal_quantity', 1,
          'main_provider_menu_item_id', 'c1011111-1111-4111-8111-111111111111',
          'side_provider_menu_item_ids', jsonb_build_array('c1022222-2222-4222-8222-222222222222'),
          'standalone_items', '[]'::jsonb
        ),
        'special_instructions', 'Checkout two'
      )
    )
  )
);

select results_eq(
  $$
    select count(*)
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'c2222222-2222-4222-8222-222222222222'
      and ld.provider_id = 'c0111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-05'::date
      and o.status = 'submitted'
  $$,
  array[6::bigint],
  'staff can submit repeat provider orders across separate checkouts'
);

select results_eq(
  $$
    select count(distinct o.order_group_id)
    from public.orders o
    where o.profile_id = 'c2222222-2222-4222-8222-222222222222'
      and o.order_group_id in (
        select (result ->> 'order_group_id')::uuid
        from checkout_runs
        where label in ('repeat_one', 'repeat_two')
      )
  $$,
  array[2::bigint],
  'repeat provider checkouts receive distinct order_group_id values'
);

select lives_ok(
  $$
    select id
    from public.orders
    where order_group_id is null
    limit 1
  $$,
  'legacy orders with null order_group_id remain readable'
);

select ok(
  (
    select count(*) >= 4
    from public.orders o
    join public.lunch_days ld on ld.id = o.lunch_day_id
    where o.profile_id = 'c2222222-2222-4222-8222-222222222222'
      and ld.order_date = '2099-01-05'::date
      and o.status = 'submitted'
  ),
  'multiple same-day submitted orders accumulate for subsidy accounting'
);

select * from finish();
rollback;
