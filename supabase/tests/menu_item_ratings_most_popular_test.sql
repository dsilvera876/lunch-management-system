begin;

select plan(25);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1010101-0101-4101-8101-010101010101', 'mp-staff1@test.local', '{"full_name":"MP Staff 1"}'),
  ('a2020202-0202-4202-8202-020202020202', 'mp-staff2@test.local', '{"full_name":"MP Staff 2"}'),
  ('a3030303-0303-4303-8303-030303030303', 'mp-staff3@test.local', '{"full_name":"MP Staff 3"}'),
  ('a4040404-0404-4404-8404-040404040404', 'mp-staff4@test.local', '{"full_name":"MP Staff 4"}'),
  ('a5050505-0505-4505-8505-050505050505', 'mp-staff5@test.local', '{"full_name":"MP Staff 5"}'),
  ('a6060606-0606-4606-8606-060606060606', 'mp-staff6@test.local', '{"full_name":"MP Staff 6"}'),
  ('a7070707-0707-4707-8707-070707070707', 'mp-hr@test.local', '{"full_name":"MP HR"}'),
  ('a8080808-0808-4808-8808-080808080808', 'mp-accounts@test.local', '{"full_name":"MP Accounts"}');

reset role;
select private.apply_profile_role('a1010101-0101-4101-8101-010101010101', 'staff');
select private.apply_profile_role('a2020202-0202-4202-8202-020202020202', 'staff');
select private.apply_profile_role('a3030303-0303-4303-8303-030303030303', 'staff');
select private.apply_profile_role('a4040404-0404-4404-8404-040404040404', 'staff');
select private.apply_profile_role('a5050505-0505-4505-8505-050505050505', 'staff');
select private.apply_profile_role('a6060606-0606-4606-8606-060606060606', 'staff');
select private.apply_profile_role('a7070707-0707-4707-8707-070707070707', 'hr');
select private.apply_profile_role('a8080808-0808-4808-8808-080808080808', 'accounts');

insert into public.lunch_providers (id, name, active, primary_order_email, ratings_enabled)
values (
  'b8080808-0808-4808-8808-080808080808',
  'MP Provider',
  true,
  'mp-provider@example.test',
  true
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  (
    'c9090909-0909-4909-8909-090909090909',
    'b8080808-0808-4808-8808-080808080808',
    'MP Hero Item',
    10.00,
    'main',
    'Each',
    true
  ),
  (
    'c9090910-0910-4910-8910-091010101010',
    'b8080808-0808-4808-8808-080808080808',
    'MP Side Item',
    2.00,
    'side',
    'Each',
    true
  ),
  (
    'c9090911-0911-4911-8911-091112131415',
    'b8080808-0808-4808-8808-080808080808',
    'MP Extra Item',
    3.00,
    'standalone',
    'Each',
    true
  );

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pmi.id, gs.wd
from public.provider_menu_items pmi
cross join generate_series(1, 5) as gs(wd)
where pmi.provider_id = 'b8080808-0808-4808-8808-080808080808'
on conflict do nothing;

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a8080808-0808-4808-8808-080808080808', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('MP Payroll', '2099-01-01', '2099-01-31');
reset role;

create or replace function pg_temp.mp_seed_staff_rating(
  p_staff uuid,
  p_idx integer,
  p_stars integer
)
returns void
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_staff::text, 'role', 'authenticated')::text,
    true
  );

  perform public.submit_provider_order(
    'b8080808-0808-4808-8808-080808080808',
    '2099-01-09'::date,
    jsonb_build_object(
      'meal_quantity', 1,
      'main_provider_menu_item_id', 'c9090909-0909-4909-8909-090909090909',
      'side_provider_menu_item_ids', jsonb_build_array('c9090910-0910-4910-8910-091010101010'),
      'standalone_items', '[]'::jsonb
    ),
    'MP order ' || p_idx::text,
    'f0000000-0000-4000-8000-000000000001'::uuid
  );

  select o.id
  into v_order_id
  from public.orders o
  where o.special_instructions = 'MP order ' || p_idx::text
  limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'a7070707-0707-4707-8707-070707070707', 'role', 'authenticated')::text,
    true
  );
  perform public.mark_order_delivered(v_order_id, '2099-01-09'::date);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_staff::text, 'role', 'authenticated')::text,
    true
  );
  perform public.upsert_my_menu_item_rating('c9090909-0909-4909-8909-090909090909', p_stars);
end;
$$;

reset role;
set local role authenticated;

select pg_temp.mp_seed_staff_rating('a1010101-0101-4101-8101-010101010101', 1, 5);
select pg_temp.mp_seed_staff_rating('a2020202-0202-4202-8202-020202020202', 2, 5);
select pg_temp.mp_seed_staff_rating('a3030303-0303-4303-8303-030303030303', 3, 5);
select pg_temp.mp_seed_staff_rating('a4040404-0404-4404-8404-040404040404', 4, 5);
select pg_temp.mp_seed_staff_rating('a5050505-0505-4505-8505-050505050505', 5, 5);
select pg_temp.mp_seed_staff_rating('a6060606-0606-4606-8606-060606060606', 6, 4);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select ok(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  'six raters with high average qualifies as most popular'
);

select ok(
  (
    public.get_staff_menu_item_rating_summaries(
      array['c9090909-0909-4909-8909-090909090909']::uuid[]
    ) -> 'summaries' -> 0 ->> 'is_most_popular'
  )::boolean,
  'batch summaries expose most popular flag'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a6060606-0606-4606-8606-060606060606', 'role', 'authenticated')::text, true);

select ok(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  'most popular flag is identical for another staff member'
);

-- Four distinct raters only (remove two profile ratings)
reset role;
delete from private.menu_item_ratings
where profile_id in (
    'a6060606-0606-4606-8606-060606060606',
    'a5050505-0505-4505-8505-050505050505'
  )
  and provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  'four distinct raters does not qualify even with strong average'
);

-- Five distinct raters with average below 4.5
reset role;
delete from private.menu_item_ratings
where provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

do $$
declare
  v_staff uuid;
  v_idx integer := 0;
  v_staff_ids uuid[] := array[
    'a1010101-0101-4101-8101-010101010101',
    'a2020202-0202-4202-8202-020202020202',
    'a3030303-0303-4303-8303-030303030303',
    'a4040404-0404-4404-8404-040404040404',
    'a5050505-0505-4505-8505-050505050505'
  ];
  v_order_id uuid;
  v_order_item_id uuid;
begin
  foreach v_staff in array v_staff_ids loop
    v_idx := v_idx + 1;
    select o.id, oi.id into v_order_id, v_order_item_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.special_instructions = 'MP order ' || v_idx::text
      and mi.provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909'
    limit 1;

    insert into private.menu_item_ratings (
      profile_id,
      provider_menu_item_id,
      provider_id,
      menu_item_generation,
      provider_rating_generation,
      stars,
      source_order_id,
      source_order_item_id,
      last_qualifying_delivery_at
    )
    select
      v_staff,
      pmi.id,
      pmi.provider_id,
      pmi.current_rating_generation,
      lp.current_provider_rating_generation,
      4,
      v_order_id,
      v_order_item_id,
      now()
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = 'c9090909-0909-4909-8909-090909090909';
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  'average below 4.5 does not qualify with five distinct raters'
);

-- Exactly five raters at threshold average (5,5,5,4,4 => 4.6)
reset role;
delete from private.menu_item_ratings
where provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

do $$
declare
  v_staff uuid;
  v_stars smallint;
  v_idx integer := 0;
  v_staff_ids uuid[] := array[
    'a1010101-0101-4101-8101-010101010101',
    'a2020202-0202-4202-8202-020202020202',
    'a3030303-0303-4303-8303-030303030303',
    'a4040404-0404-4404-8404-040404040404',
    'a5050505-0505-4505-8505-050505050505'
  ];
  v_star_sets smallint[] := array[5, 5, 5, 4, 4];
  v_order_id uuid;
  v_order_item_id uuid;
begin
  foreach v_staff in array v_staff_ids loop
    v_idx := v_idx + 1;
    v_stars := v_star_sets[v_idx];

    select o.id, oi.id into v_order_id, v_order_item_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.special_instructions = 'MP order ' || v_idx::text
      and mi.provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909'
    limit 1;

    insert into private.menu_item_ratings (
      profile_id,
      provider_menu_item_id,
      provider_id,
      menu_item_generation,
      provider_rating_generation,
      stars,
      source_order_id,
      source_order_item_id,
      last_qualifying_delivery_at
    )
    select
      v_staff,
      pmi.id,
      pmi.provider_id,
      pmi.current_rating_generation,
      lp.current_provider_rating_generation,
      v_stars,
      v_order_id,
      v_order_item_id,
      now()
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = 'c9090909-0909-4909-8909-090909090909';
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select ok(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  'exactly five distinct raters with average at least 4.5 qualifies'
);

select is(
  (public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'average_stars')::numeric,
  4.60::numeric,
  'threshold average uses valid staff ratings including caller'
);

-- Removed rating excluded
reset role;
update private.menu_item_ratings
set removed_at = now(), removed_by = 'a7070707-0707-4707-8707-070707070707', removal_reason = 'test'
where profile_id = 'a5050505-0505-4505-8505-050505050505'
  and provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  'removed ratings drop distinct rater count below threshold'
);

-- Voided rating excluded
reset role;
update private.menu_item_ratings
set removed_at = null, removed_by = null, removal_reason = null
where profile_id = 'a5050505-0505-4505-8505-050505050505'
  and provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

update private.menu_item_ratings
set eligibility_voided_at = now()
where profile_id = 'a4040404-0404-4404-8404-040404040404'
  and provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  'voided ratings excluded from most popular eligibility'
);

-- Item generation reset clears badge
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a7070707-0707-4707-8707-070707070707', 'role', 'authenticated')::text, true);
select public.hr_reset_catalog_menu_item_ratings('c9090909-0909-4909-8909-090909090909', 'MP item reset');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  'item generation reset clears most popular until new ratings accumulate'
);

-- Re-seed five high ratings in new generation
reset role;
do $$
declare
  v_staff uuid;
  v_idx integer := 0;
  v_staff_ids uuid[] := array[
    'a1010101-0101-4101-8101-010101010101',
    'a2020202-0202-4202-8202-020202020202',
    'a3030303-0303-4303-8303-030303030303',
    'a4040404-0404-4404-8404-040404040404',
    'a5050505-0505-4505-8505-050505050505'
  ];
  v_order_id uuid;
  v_order_item_id uuid;
begin
  foreach v_staff in array v_staff_ids loop
    v_idx := v_idx + 1;
    select o.id, oi.id into v_order_id, v_order_item_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.special_instructions = 'MP order ' || v_idx::text
      and mi.provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909'
    limit 1;

    insert into private.menu_item_ratings (
      profile_id,
      provider_menu_item_id,
      provider_id,
      menu_item_generation,
      provider_rating_generation,
      stars,
      source_order_id,
      source_order_item_id,
      last_qualifying_delivery_at
    )
    select
      v_staff,
      pmi.id,
      pmi.provider_id,
      pmi.current_rating_generation,
      lp.current_provider_rating_generation,
      5,
      v_order_id,
      v_order_item_id,
      now()
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = 'c9090909-0909-4909-8909-090909090909';
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select ok(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  'most popular returns after enough ratings in new item generation'
);

-- Provider reset bumps provider generation and clears eligibility
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a7070707-0707-4707-8707-070707070707', 'role', 'authenticated')::text, true);
select public.hr_reset_provider_menu_item_ratings('b8080808-0808-4808-8808-080808080808', 'MP provider reset');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  'provider generation reset excludes prior ratings from most popular'
);

-- Disabled provider hides summaries (no badge data)
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a7070707-0707-4707-8707-070707070707', 'role', 'authenticated')::text, true);
select public.hr_set_provider_menu_item_ratings_enabled('b8080808-0808-4808-8808-080808080808', false, 'MP disable');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') $$,
  'P0001',
  'Menu item ratings are not available',
  'disabled provider blocks staff summary including most popular'
);

select is(
  jsonb_array_length(
    public.get_staff_menu_item_rating_summaries(
      array['c9090909-0909-4909-8909-090909090909']::uuid[]
    ) -> 'summaries'
  ),
  0,
  'batch summaries omit items when provider ratings disabled'
);

-- Re-enable preserves generation-scoped ratings for eligibility
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a7070707-0707-4707-8707-070707070707', 'role', 'authenticated')::text, true);
select public.hr_set_provider_menu_item_ratings_enabled('b8080808-0808-4808-8808-080808080808', true, '');

-- Still no ratings in current provider generation after reset — not popular
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  false,
  're-enabled provider without current-generation ratings stays not popular'
);

select ok(
  not (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909')
      ? 'provider_rating_generation'
  ),
  'staff summary does not expose provider moderation fields'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('c9090910-0910-4910-8910-091010101010', 5) $$,
  'P0001',
  'Only main menu items can be rated by staff',
  'staff cannot submit ratings for side menu items'
);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('c9090911-0911-4911-8911-091112131415', 5) $$,
  'P0001',
  'Only main menu items can be rated by staff',
  'staff cannot submit ratings for standalone menu items'
);

-- Six distinct raters with aggregate average exactly 4.5 (5, 5, 5, 4, 4, 4)
reset role;
delete from private.menu_item_ratings
where provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909';

do $$
declare
  v_staff uuid;
  v_stars smallint;
  v_idx integer := 0;
  v_staff_ids uuid[] := array[
    'a1010101-0101-4101-8101-010101010101',
    'a2020202-0202-4202-8202-020202020202',
    'a3030303-0303-4303-8303-030303030303',
    'a4040404-0404-4404-8404-040404040404',
    'a5050505-0505-4505-8505-050505050505',
    'a6060606-0606-4606-8606-060606060606'
  ];
  v_star_sets smallint[] := array[5, 5, 5, 4, 4, 4];
  v_order_id uuid;
  v_order_item_id uuid;
begin
  foreach v_staff in array v_staff_ids loop
    v_idx := v_idx + 1;
    v_stars := v_star_sets[v_idx];

    select o.id, oi.id into v_order_id, v_order_item_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.special_instructions = 'MP order ' || v_idx::text
      and mi.provider_menu_item_id = 'c9090909-0909-4909-8909-090909090909'
    limit 1;

    insert into private.menu_item_ratings (
      profile_id,
      provider_menu_item_id,
      provider_id,
      menu_item_generation,
      provider_rating_generation,
      stars,
      source_order_id,
      source_order_item_id,
      last_qualifying_delivery_at
    )
    select
      v_staff,
      pmi.id,
      pmi.provider_id,
      pmi.current_rating_generation,
      lp.current_provider_rating_generation,
      v_stars,
      v_order_id,
      v_order_item_id,
      now()
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = 'c9090909-0909-4909-8909-090909090909';
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'average_stars'
  )::numeric,
  4.50::numeric,
  'six distinct staff ratings aggregate to exactly 4.5 average'
);

select ok(
  (
    public.get_staff_menu_item_rating_summary('c9090909-0909-4909-8909-090909090909') ->> 'is_most_popular'
  )::boolean,
  'exactly 4.5 average with six distinct raters qualifies main item as most popular'
);

reset role;

select is(
  private.staff_menu_item_qualifies_most_popular(4.5, 5),
  true,
  'qualification helper accepts average exactly 4.5 with five distinct raters'
);

select is(
  private.staff_menu_item_qualifies_most_popular(4.49, 5),
  false,
  'qualification helper rejects average below 4.5'
);

-- Side item with strong community ratings never receives most popular (main-only catalog rule)
reset role;
do $$
declare
  v_staff uuid;
  v_idx integer := 0;
  v_staff_ids uuid[] := array[
    'a1010101-0101-4101-8101-010101010101',
    'a2020202-0202-4202-8202-020202020202',
    'a3030303-0303-4303-8303-030303030303',
    'a4040404-0404-4404-8404-040404040404',
    'a5050505-0505-4505-8505-050505050505'
  ];
  v_order_id uuid;
  v_order_item_id uuid;
begin
  foreach v_staff in array v_staff_ids loop
    v_idx := v_idx + 1;
    select o.id, oi.id into v_order_id, v_order_item_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.menu_items mi on mi.id = oi.menu_item_id
    where o.special_instructions = 'MP order ' || v_idx::text
      and mi.provider_menu_item_id = 'c9090910-0910-4910-8910-091010101010'
    limit 1;

    insert into private.menu_item_ratings (
      profile_id,
      provider_menu_item_id,
      provider_id,
      menu_item_generation,
      provider_rating_generation,
      stars,
      source_order_id,
      source_order_item_id,
      last_qualifying_delivery_at
    )
    select
      v_staff,
      pmi.id,
      pmi.provider_id,
      pmi.current_rating_generation,
      lp.current_provider_rating_generation,
      5,
      v_order_id,
      v_order_item_id,
      now()
    from public.provider_menu_items pmi
    join public.lunch_providers lp on lp.id = pmi.provider_id
    where pmi.id = 'c9090910-0910-4910-8910-091010101010';
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1010101-0101-4101-8101-010101010101', 'role', 'authenticated')::text, true);

select is(
  (
    public.get_staff_menu_item_rating_summary('c9090910-0910-4910-8910-091010101010') ->> 'is_most_popular'
  )::boolean,
  false,
  'side menu items never qualify for most popular even with five high ratings'
);

select is(
  (
    public.get_staff_menu_item_rating_summaries(
      array['c9090910-0910-4910-8910-091010101010']::uuid[]
    ) -> 'summaries' -> 0 ->> 'is_most_popular'
  )::boolean,
  false,
  'batch summaries keep side items ineligible for most popular'
);

select is(
  (
    public.get_staff_menu_item_rating_summaries(
      array['c9090910-0910-4910-8910-091010101010']::uuid[]
    ) -> 'summaries' -> 0 ->> 'can_submit_or_update'
  )::boolean,
  false,
  'batch summaries do not offer rating submit on side items'
);

select * from finish();

rollback;
