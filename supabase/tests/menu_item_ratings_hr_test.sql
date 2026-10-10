begin;

select plan(36);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'mir-hr-staff@test.local', '{"full_name":"MIR HR Staff A"}'),
  ('22222222-2222-4222-8222-222222222222', 'mir-hr-staff-b@test.local', '{"full_name":"MIR HR Staff B"}'),
  ('33333333-3333-4333-8333-333333333333', 'mir-hr-hr@test.local', '{"full_name":"MIR HR User"}'),
  ('44444444-4444-4444-8444-444444444444', 'mir-hr-admin@test.local', '{"full_name":"MIR HR Admin"}'),
  ('55555555-5555-4555-8555-555555555555', 'mir-hr-accounts@test.local', '{"full_name":"MIR HR Accounts"}');

reset role;

select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'accounts');

update public.profiles
set default_office_location_id = 'f0000000-0000-4000-8000-000000000001'
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email, ratings_enabled)
values (
  '99999999-9999-4999-8999-999999999999',
  'MIR HR Provider',
  true,
  'mir-hr-provider@example.test',
  true
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('b1111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999', 'HR Chicken', 12.00, 'main', 'Each', true),
  ('b2222222-2222-4222-8222-222222222222', '99999999-9999-4999-8999-999999999999', 'HR Rice', 3.00, 'side', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pmi.id, gs.wd
from public.provider_menu_items pmi
cross join generate_series(1, 5) as gs(wd)
where pmi.provider_id = '99999999-9999-4999-8999-999999999999'
on conflict do nothing;

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('MIR HR Payroll', '2099-02-01', '2099-02-28');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.submit_provider_order(
  '99999999-9999-4999-8999-999999999999',
  '2099-02-06'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["b2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR HR order A',
  'f0000000-0000-4000-8000-000000000001'
);
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select public.submit_provider_order(
  '99999999-9999-4999-8999-999999999999',
  '2099-02-06'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["b2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR HR order B',
  'f0000000-0000-4000-8000-000000000002'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.mark_order_delivered((select id from public.orders where special_instructions = 'MIR HR order A'), '2099-02-06'::date);
select public.mark_order_delivered((select id from public.orders where special_instructions = 'MIR HR order B'), '2099-02-06'::date);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 4);
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 2);
reset role;

-- Access control
reset role;
select set_config('request.jwt.claims', '', false);
select throws_ok(
  $$ select public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') $$,
  'P0001',
  'Authentication required',
  'anonymous cannot load HR ratings dashboard'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') $$,
  'P0001',
  'Permanent HR access required',
  'staff cannot load HR ratings dashboard'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') $$,
  'P0001',
  'Permanent HR access required',
  'admin cannot load HR ratings dashboard'
);

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') $$,
  'P0001',
  'Permanent HR access required',
  'accounts cannot load HR ratings dashboard'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select * from public.start_support_session('hr', 'mir hr ratings denial') $$,
  'admin can start HR support session for denial test'
);

select throws_ok(
  $$ select public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') $$,
  'P0001',
  'Menu item ratings administration is unavailable in Support Mode',
  'support mode blocks HR ratings dashboard'
);

select throws_ok(
  $$ select public.hr_remove_menu_item_rating('00000000-0000-4000-8000-000000000099', 'test') $$,
  'P0001',
  'Menu item ratings administration is unavailable in Support Mode',
  'support mode blocks HR rating removal'
);

select public.end_support_session();
reset role;

-- HR dashboard aggregates
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') ->> 'provider_average_stars')::numeric,
  3.00::numeric,
  'provider average uses equal-weight valid menu item ratings'
);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') ->> 'provider_rating_count')::bigint,
  2::bigint,
  'provider rating count includes active menu item ratings'
);

select ok(
  jsonb_array_length(
    public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') -> 'menu_items'
  ) >= 2,
  'dashboard lists catalog items including inactive'
);

-- HR remove rating
select ok(
  (
    public.get_hr_catalog_menu_item_ratings_detail('b1111111-1111-4111-8111-111111111111')
      -> 'ratings' -> 0 ->> 'id'
  ) is not null,
  'catalog detail exposes rating id for moderation'
);

select set_config(
  'test.mir_hr_rating_a',
  public.get_hr_catalog_menu_item_ratings_detail('b1111111-1111-4111-8111-111111111111')
    -> 'ratings' -> 0 ->> 'id',
  false
);

select lives_ok(
  format(
    $$ select public.hr_remove_menu_item_rating(%L::uuid, '') $$,
    current_setting('test.mir_hr_rating_a')
  ),
  'HR removes staff rating without mandatory reason'
);

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.get_hr_provider_menu_item_ratings_audit(
        '99999999-9999-4999-8999-999999999999',
        1,
        20
      ) -> 'entries'
    ) entry
    where entry ->> 'action' = 'remove_rating'
  ),
  'remove rating writes moderation audit row'
);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') ->> 'provider_rating_count')::bigint,
  1::bigint,
  'removed rating excluded from provider aggregate'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 5) $$,
  'P0001',
  'This rating was removed and cannot be resubmitted for the current period',
  'HR removal blocks staff resubmit same generation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

-- Menu item reset
reset role;

update public.order_delivery_events e
set created_at = e.created_at - interval '2 hours'
from public.orders o
where o.id = e.order_id
  and o.special_instructions like 'MIR HR order%';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_reset_catalog_menu_item_ratings('b1111111-1111-4111-8111-111111111111', 'Fresh start for item') $$,
  'HR resets catalog menu item ratings'
);

select is(
  (select current_rating_generation from public.provider_menu_items where id = 'b1111111-1111-4111-8111-111111111111'),
  2,
  'menu item reset bumps catalog generation'
);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') ->> 'provider_rating_count')::bigint,
  0::bigint,
  'prior-generation ratings excluded after menu item reset'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 5) $$,
  'P0001',
  'A verified delivery is required before rating this item',
  'menu item reset requires new verified delivery before rating'
);
reset role;

-- New delivery and rating for provider reset test
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.submit_provider_order(
  '99999999-9999-4999-8999-999999999999',
  '2099-02-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["b2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR HR order A after reset',
  'f0000000-0000-4000-8000-000000000001'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.mark_order_delivered(
  (select id from public.orders where special_instructions = 'MIR HR order A after reset'),
  '2099-02-09'::date
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.upsert_my_menu_item_rating('b1111111-1111-4111-8111-111111111111', 5);
reset role;

-- Enable / disable (before provider-wide reset so current-generation ratings exist)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_set_provider_menu_item_ratings_enabled('99999999-9999-4999-8999-999999999999', false, 'Temporary pause') $$,
  'HR disables provider ratings with optional reason'
);

select lives_ok(
  $$ select public.hr_set_provider_menu_item_ratings_enabled('99999999-9999-4999-8999-999999999999', true, '') $$,
  'HR re-enables provider ratings without reason before disable without reason'
);

select lives_ok(
  $$ select public.hr_set_provider_menu_item_ratings_enabled('99999999-9999-4999-8999-999999999999', false, '') $$,
  'HR disables provider ratings without mandatory reason'
);

select is(
  (select ratings_enabled from public.lunch_providers where id = '99999999-9999-4999-8999-999999999999'),
  false,
  'ratings_enabled updated on disable'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.get_staff_menu_item_rating_summary('b1111111-1111-4111-8111-111111111111') $$,
  'P0001',
  'Menu item ratings are not available',
  'disabled provider hides staff rating summary'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.hr_set_provider_menu_item_ratings_enabled('99999999-9999-4999-8999-999999999999', true, '') $$,
  'HR re-enables provider ratings without reset'
);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') ->> 'ratings_enabled')::boolean,
  true,
  'dashboard reflects re-enabled ratings'
);

select is(
  (public.get_hr_provider_menu_item_ratings_dashboard('99999999-9999-4999-8999-999999999999') ->> 'provider_rating_count')::bigint,
  1::bigint,
  're-enabling preserves current-generation ratings without reset'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_reset_provider_menu_item_ratings('99999999-9999-4999-8999-999999999999', 'Provider-wide reset') $$,
  'HR resets all provider menu item ratings'
);

select is(
  (select current_provider_rating_generation from public.lunch_providers where id = '99999999-9999-4999-8999-999999999999'),
  2,
  'provider reset bumps provider assessment generation'
);

select is(
  (select current_rating_generation from public.provider_menu_items where id = 'b2222222-2222-4222-8222-222222222222'),
  2,
  'provider reset bumps inactive catalog item generation'
);

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.get_hr_provider_menu_item_ratings_audit(
        '99999999-9999-4999-8999-999999999999',
        1,
        20
      ) -> 'entries'
    ) entry
    where entry ->> 'action' = 'reset_provider'
  ),
  'provider reset writes audit row'
);

-- Ordering unaffected
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_provider_order(
    '99999999-9999-4999-8999-999999999999',
    '2099-02-09'::date,
    '{"meal_quantity":1,"main_provider_menu_item_id":"b1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["b2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
    'MIR HR order after admin',
    'f0000000-0000-4000-8000-000000000001'
  ) $$,
  'staff ordering still works alongside HR ratings admin'
);

-- Paginated catalog detail (100+ ratings, newest first)
reset role;

do $$
declare
  v_i integer;
  v_profile_id uuid;
  v_order_id uuid;
  v_order_item_id uuid;
begin
  select o.id, oi.id
  into v_order_id, v_order_item_id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.special_instructions = 'MIR HR order after admin'
  limit 1;

  delete from private.menu_item_ratings
  where provider_menu_item_id = 'b1111111-1111-4111-8111-111111111111';

  for v_i in 1..105 loop
    v_profile_id := ('aaaa0000-0000-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
    insert into auth.users (id, email, raw_user_meta_data)
    values (
      v_profile_id,
      'mir-hr-page-' || v_i::text || '@test.local',
      jsonb_build_object('full_name', 'MIR Page Staff ' || v_i::text)
    )
    on conflict (id) do nothing;

    insert into private.menu_item_ratings (
      profile_id,
      provider_menu_item_id,
      provider_id,
      menu_item_generation,
      provider_rating_generation,
      stars,
      source_order_id,
      source_order_item_id,
      last_qualifying_delivery_at,
      created_at
    )
    select
      v_profile_id,
      'b1111111-1111-4111-8111-111111111111',
      '99999999-9999-4999-8999-999999999999',
      pmi.current_rating_generation,
      lp.current_provider_rating_generation,
      (1 + (v_i % 5))::smallint,
      v_order_id,
      v_order_item_id,
      now() - (v_i || ' minutes')::interval,
      now() - (v_i || ' minutes')::interval
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = 'b1111111-1111-4111-8111-111111111111';
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (public.get_hr_catalog_menu_item_ratings_detail(
    'b1111111-1111-4111-8111-111111111111',
    1,
    20
  ) ->> 'total_count')::bigint,
  105::bigint,
  'catalog detail reports total rating count'
);

select is(
  jsonb_array_length(
    public.get_hr_catalog_menu_item_ratings_detail(
      'b1111111-1111-4111-8111-111111111111',
      1,
      20
    ) -> 'ratings'
  ),
  20,
  'catalog detail page 1 returns 20 ratings'
);

select is(
  jsonb_array_length(
    public.get_hr_catalog_menu_item_ratings_detail(
      'b1111111-1111-4111-8111-111111111111',
      6,
      20
    ) -> 'ratings'
  ),
  5,
  'catalog detail last page returns remaining ratings'
);

select is(
  (
    public.get_hr_catalog_menu_item_ratings_detail(
      'b1111111-1111-4111-8111-111111111111',
      1,
      20
    ) -> 'ratings' -> 0 ->> 'created_at'
  ) >= (
    public.get_hr_catalog_menu_item_ratings_detail(
      'b1111111-1111-4111-8111-111111111111',
      1,
      20
    ) -> 'ratings' -> 1 ->> 'created_at'
  ),
  true,
  'catalog detail orders ratings newest first'
);

select * from finish();
rollback;
