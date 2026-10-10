begin;

select plan(14);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'mir-conc-staff@test.local', '{"full_name":"MIR Conc Staff"}'),
  ('33333333-3333-4333-8333-333333333333', 'mir-conc-hr@test.local', '{"full_name":"MIR Conc HR"}'),
  ('55555555-5555-4555-8555-555555555555', 'mir-conc-accounts@test.local', '{"full_name":"MIR Conc Accounts"}');

reset role;

select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'accounts');

update public.profiles
set default_office_location_id = 'f0000000-0000-4000-8000-000000000001'
where id in (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555'
);

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email, ratings_enabled)
values (
  'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'MIR Conc Provider',
  true,
  'mir-conc@example.test',
  true
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('b1111111-1111-4111-8111-111111111111', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conc Main', 12.00, 'main', 'Each', true),
  ('b2222222-2222-4222-8222-222222222222', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conc Side', 3.00, 'side', 'Each', true),
  ('b3333333-3333-4333-8333-333333333333', 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conc Retired', 1.00, 'side', 'Each', false);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pmi.id, gs.wd
from public.provider_menu_items pmi
cross join generate_series(1, 5) as gs(wd)
where pmi.provider_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
on conflict do nothing;

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('MIR Conc Payroll', '2099-03-01', '2099-03-31');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.submit_provider_order(
  'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2099-03-06'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["b2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR conc order',
  'f0000000-0000-4000-8000-000000000001'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.mark_order_delivered(
  (select id from public.orders where special_instructions = 'MIR conc order'),
  '2099-03-06'::date
);
reset role;

update public.order_delivery_events e
set created_at = e.created_at - interval '2 hours'
from public.orders o
where o.id = e.order_id and o.special_instructions = 'MIR conc order';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 4);
reset role;

-- Staff rating blocked immediately after HR menu-item reset (same generation)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_reset_catalog_menu_item_ratings('b1111111-1111-4111-8111-111111111111', 'Concurrent reset test') $$,
  'HR menu-item reset succeeds under lock'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 5) $$,
  'P0001',
  'A verified delivery is required before rating this item',
  'staff cannot rate stale generation after menu-item reset without new delivery'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'provider_rating_count')::bigint,
  0::bigint,
  'menu-item reset excludes prior generation from provider aggregate'
);

-- New delivery + rating in new generation
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.submit_provider_order(
  'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2099-03-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["b2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR conc order after item reset',
  'f0000000-0000-4000-8000-000000000001'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.mark_order_delivered(
  (select id from public.orders where special_instructions = 'MIR conc order after item reset'),
  '2099-03-09'::date
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 5);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'provider_rating_count')::bigint,
  1::bigint,
  'new-generation staff rating contributes after reset and delivery'
);

-- HR remove during active generation, then staff blocked from re-rating
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select set_config(
  'test.mir_conc_rating_id',
  (
    public.get_hr_catalog_menu_item_ratings_detail('b1111111-1111-4111-8111-111111111111')
      -> 'ratings' -> 0 ->> 'id'
  ),
  false
);

select lives_ok(
  format(
    $$ select public.hr_remove_menu_item_rating(%L::uuid, 'Concurrent removal') $$,
    current_setting('test.mir_conc_rating_id')
  ),
  'HR removes active rating while generation unchanged'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 3) $$,
  'P0001',
  'This rating was removed and cannot be resubmitted for the current period',
  'HR removal blocks staff update in same generation'
);

-- Provider reset during assessment + inactive catalog bump
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_reset_provider_menu_item_ratings('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Concurrent provider reset A') $$,
  'first provider reset request succeeds'
);

select lives_ok(
  $$ select public.hr_reset_provider_menu_item_ratings('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Concurrent provider reset B') $$,
  'second provider reset request succeeds sequentially'
);

select is(
  (select current_provider_rating_generation from public.lunch_providers where id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  3,
  'sequential provider resets bump generation twice'
);

select is(
  (select current_rating_generation from public.provider_menu_items where id = 'b3333333-3333-4333-8333-333333333333'),
  3,
  'inactive catalog item generation tracks provider reset'
);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'provider_rating_count')::bigint,
  0::bigint,
  'provider reset clears active aggregates across generations'
);

-- Audit: exactly one row per successful mutation in this flow segment
select is(
  (
    select count(*)::bigint
    from jsonb_array_elements(
      public.get_hr_provider_menu_item_ratings_audit('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 50) -> 'entries'
    ) entry
    where entry ->> 'action' = 'reset_menu_item'
  ),
  1::bigint,
  'menu-item reset writes exactly one audit entry'
);

select is(
  (
    select count(*)::bigint
    from jsonb_array_elements(
      public.get_hr_provider_menu_item_ratings_audit('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 50) -> 'entries'
    ) entry
    where entry ->> 'action' = 'remove_rating'
  ),
  1::bigint,
  'remove rating writes exactly one audit entry'
);

select is(
  (
    select count(*)::bigint
    from jsonb_array_elements(
      public.get_hr_provider_menu_item_ratings_audit('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 50) -> 'entries'
    ) entry
    where entry ->> 'action' = 'reset_provider'
  ),
  2::bigint,
  'two provider resets write two audit entries'
);

select * from finish();
rollback;
