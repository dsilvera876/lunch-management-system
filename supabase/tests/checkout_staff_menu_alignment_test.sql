begin;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'f1111111-1111-4111-8111-111111111111',
  'menu-align-admin@test.local',
  '{"full_name":"Menu Align Admin"}'
),
(
  'f2222222-2222-4222-8222-222222222222',
  'menu-align-user@test.local',
  '{"full_name":"Menu Align User"}'
);

reset role;
select private.apply_profile_role('f1111111-1111-4111-8111-111111111111', 'admin');

\ir support/open_ordering.inc

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

insert into public.lunch_providers (id, name, active)
values
  ('f0111111-1111-4111-8111-111111111111', 'Meal Kitchen', true),
  ('f0222222-2222-4222-8222-222222222222', 'Fruit Stand', true)
on conflict (id) do nothing;

insert into public.provider_menu_items (
  id, provider_id, name, price, item_type, unit_label, active
)
values
  ('f1011111-1111-4111-8111-111111111111', 'f0111111-1111-4111-8111-111111111111', 'BBQ Chicken', 12.00, 'main', 'Each', true),
  ('f1022222-2222-4222-8222-222222222222', 'f0111111-1111-4111-8111-111111111111', 'Plain Rice', 0.00, 'side', 'Each', true),
  ('f1033333-3333-4333-8333-333333333333', 'f0222222-2222-4222-8222-222222222222', 'Banana', 1.50, 'standalone', 'Each', true)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
values
  ('f1011111-1111-4111-8111-111111111111', 1),
  ('f1022222-2222-4222-8222-222222222222', 1),
  ('f1033333-3333-4333-8333-333333333333', 1)
on conflict do nothing;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_checkout(
      '2099-01-05'::date,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'provider_id', 'f0111111-1111-4111-8111-111111111111',
          'items', jsonb_build_object(
            'meal_quantity', 1,
            'main_provider_menu_item_id', 'f1011111-1111-4111-8111-111111111111',
            'side_provider_menu_item_ids', jsonb_build_array('f1022222-2222-4222-8222-222222222222'),
            'standalone_items', '[]'::jsonb
          ),
          'special_instructions', null
        )
      )
    )
  $$,
  'meal checkout accepts provider_menu_item ids and materializes lunch-day snapshot'
);

select lives_ok(
  $$
    select public.submit_provider_checkout(
      '2099-01-05'::date,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'provider_id', 'f0222222-2222-4222-8222-222222222222',
          'items', jsonb_build_object(
            'meal_quantity', null,
            'main_provider_menu_item_id', null,
            'side_provider_menu_item_ids', '[]'::jsonb,
            'standalone_items', jsonb_build_array(
              jsonb_build_object(
                'provider_menu_item_id', 'f1033333-3333-4333-8333-333333333333',
                'quantity', 2
              )
            )
          ),
          'special_instructions', null
        )
      )
    )
  $$,
  'standalone checkout accepts provider_menu_item ids after snapshot materialization'
);

select lives_ok(
  $$
    select public.submit_provider_checkout(
      '2099-01-05'::date,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'provider_id', 'f0111111-1111-4111-8111-111111111111',
          'items', jsonb_build_object(
            'meal_quantity', 1,
            'main_provider_menu_item_id', 'f1011111-1111-4111-8111-111111111111',
            'side_provider_menu_item_ids', jsonb_build_array('f1022222-2222-4222-8222-222222222222'),
            'standalone_items', '[]'::jsonb
          ),
          'special_instructions', null
        ),
        jsonb_build_object(
          'provider_id', 'f0222222-2222-4222-8222-222222222222',
          'items', jsonb_build_object(
            'meal_quantity', null,
            'main_provider_menu_item_id', null,
            'side_provider_menu_item_ids', '[]'::jsonb,
            'standalone_items', jsonb_build_array(
              jsonb_build_object(
                'provider_menu_item_id', 'f1033333-3333-4333-8333-333333333333',
                'quantity', 1
              )
            )
          ),
          'special_instructions', null
        )
      )
    )
  $$,
  'multi-provider checkout succeeds with provider_menu_item ids'
);

select throws_like(
  $$
    select public.submit_provider_checkout(
      '2099-01-05'::date,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'provider_id', 'f0222222-2222-4222-8222-222222222222',
          'items', jsonb_build_object(
            'meal_quantity', null,
            'main_provider_menu_item_id', null,
            'side_provider_menu_item_ids', '[]'::jsonb,
            'standalone_items', jsonb_build_array(
              jsonb_build_object(
                'provider_menu_item_id', (
                  select mi.id
                  from public.menu_items mi
                  join public.lunch_days ld on ld.id = mi.lunch_day_id
                  where ld.provider_id = 'f0222222-2222-4222-8222-222222222222'
                    and ld.order_date = '2099-01-05'::date
                    and mi.provider_menu_item_id = 'f1033333-3333-4333-8333-333333333333'
                  limit 1
                ),
                'quantity', 1
              )
            )
          ),
          'special_instructions', null
        )
      )
    )
  $$,
  '%Menu item % for provider % is invalid or inactive%',
  'snapshot menu_items.id is rejected when sent as provider_menu_item_id'
);

select * from finish();
rollback;
