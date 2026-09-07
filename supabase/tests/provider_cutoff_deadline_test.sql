begin;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'a1111111-1111-4111-8111-111111111111',
  'cutoff-admin@test.local',
  '{"full_name":"Cutoff Admin"}'
),
(
  'a2222222-2222-4222-8222-222222222222',
  'cutoff-user@test.local',
  '{"full_name":"Cutoff User"}'
);

reset role;
select private.apply_profile_role('a1111111-1111-4111-8111-111111111111', 'admin');

reset role;

update public.app_settings
set order_cutoff_time = '16:00:00'
where id = 1;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a1111111-1111-4111-8111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

insert into public.lunch_providers (id, name, active)
values (
  'b1111111-1111-4111-8111-111111111111',
  'Cutoff Test Kitchen',
  true
);

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  active
)
values (
  'c1111111-1111-4111-8111-111111111111',
  'b1111111-1111-4111-8111-111111111111',
  'Cutoff Meal',
  10.00,
  true
);

insert into public.provider_menu_item_weekdays (
  provider_menu_item_id,
  weekday
)
values (
  'c1111111-1111-4111-8111-111111111111',
  1
);

reset role;

-- 2099-01-05 is a Monday.

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select public.submit_provider_order(
  'b1111111-1111-4111-8111-111111111111',
  '2099-01-05'::date,
  '[
    {
      "provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
      "quantity": 1
    }
  ]'::jsonb
);

reset role;

select results_eq(
  $$
    select to_char(
      ld.order_deadline at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
    from public.lunch_days ld
    where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-05'::date
  $$,
  array['16:00:00'::text],
  'Provider cycle stores the cutoff active when it was generated'
);

update public.app_settings
set order_cutoff_time = '17:00:00'
where id = 1;

select results_eq(
  $$
    select to_char(
      public.effective_order_deadline(ld.id) at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
    from public.lunch_days ld
    where ld.provider_id = 'b1111111-1111-4111-8111-111111111111'
      and ld.order_date = '2099-01-05'::date
  $$,
  array['17:00:00'::text],
  'Effective provider deadline follows the updated HR cutoff'
);

select results_eq(
  $$
    select to_char(
      public.order_deadline_for_order_date('2099-01-05'::date)
        at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
  $$,
  array['17:00:00'::text],
  'UI/helper deadline source matches database enforcement helper'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2099-01-05'::date,
      '[
        {
          "provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
          "quantity": 1
        }
      ]'::jsonb
    )
  $$,
  'Already-generated provider cycle accepts orders using the later cutoff'
);

reset role;

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'd1111111-1111-4111-8111-111111111111',
  public.delivery_date_for_order_date('2020-01-06'::date),
  '2020-01-06'::date,
  'b1111111-1111-4111-8111-111111111111',
  public.order_deadline_for_order_date('2020-01-06'::date),
  'open'
);

insert into public.menu_items (
  lunch_day_id,
  provider_menu_item_id,
  name,
  price,
  is_active
)
values (
  'd1111111-1111-4111-8111-111111111111',
  'c1111111-1111-4111-8111-111111111111',
  'Cutoff Meal',
  10.00,
  true
);

update public.app_settings
set order_cutoff_time = '00:00:00'
where id = 1;

select ok(
  (
    select to_char(
      ld.order_deadline at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
    from public.lunch_days ld
    where ld.id = 'd1111111-1111-4111-8111-111111111111'
  ) = '23:59:00'
  and (
    select to_char(
      public.effective_order_deadline('d1111111-1111-4111-8111-111111111111')
        at time zone 'America/Jamaica',
      'HH24:MI:SS'
    )
  ) = '00:00:00',
  'Stored provider deadline can remain later while effective deadline moves earlier'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a2222222-2222-4222-8222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);

select throws_ok(
  $$
    select public.submit_provider_order(
      'b1111111-1111-4111-8111-111111111111',
      '2020-01-06'::date,
      '[
        {
          "provider_menu_item_id": "c1111111-1111-4111-8111-111111111111",
          "quantity": 1
        }
      ]'::jsonb
    )
  $$,
  'P0001',
  'The ordering deadline has passed',
  'Moving the cutoff earlier is enforced even when stored deadline is later'
);

-- Legacy lunch days keep their explicit stored deadline.

reset role;

\ir support/legacy_lunch_day_fixture.inc

update public.lunch_days
set
  status = 'open',
  order_deadline = now() + interval '1 day'
where id = '10000000-0000-0000-0000-000000000001';

update public.app_settings
set order_cutoff_time = '16:00:00'
where id = 1;

select ok(
  public.effective_order_deadline('10000000-0000-0000-0000-000000000001')
    = (
      select order_deadline
      from public.lunch_days
      where id = '10000000-0000-0000-0000-000000000001'
    ),
  'Legacy lunch days keep their explicit stored order_deadline'
);

select * from finish();

rollback;
