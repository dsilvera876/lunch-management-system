begin;

select plan(33);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc
\ir support/office_location_fixture.inc
\ir support/assign_test_office_defaults.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'mir-staff@test.local', '{"full_name":"MIR Staff"}'),
  ('22222222-2222-4222-8222-222222222222', 'mir-staff-b@test.local', '{"full_name":"MIR Staff B"}'),
  ('33333333-3333-4333-8333-333333333333', 'mir-hr@test.local', '{"full_name":"MIR HR"}'),
  ('44444444-4444-4444-8444-444444444444', 'mir-admin@test.local', '{"full_name":"MIR Admin"}'),
  ('55555555-5555-4555-8555-555555555555', 'mir-accounts@test.local', '{"full_name":"MIR Accounts"}');

reset role;

select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'accounts');

reset role;

insert into public.lunch_providers (id, name, active, primary_order_email, ratings_enabled)
values (
  '88888888-8888-4888-8888-888888888888',
  'MIR Provider',
  true,
  'mir-provider@example.test',
  true
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('a1111111-1111-4111-8111-111111111111', '88888888-8888-4888-8888-888888888888', 'MIR Chicken', 12.00, 'main', 'Each', true),
  ('a2222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'MIR Rice', 3.00, 'side', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select pmi.id, gs.wd
from public.provider_menu_items pmi
cross join generate_series(1, 5) as gs(wd)
where pmi.provider_id = '88888888-8888-4888-8888-888888888888'
on conflict do nothing;

update public.app_settings set order_cutoff_time = '23:59:00' where id = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
select public.create_first_lunch_period('MIR Payroll', '2099-01-01', '2099-01-31');
reset role;

-- Staff A: first order (2099-01-09 Friday)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR order A',
  'f0000000-0000-4000-8000-000000000001'
);

-- Staff B: same menu for aggregation
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-09'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR order B',
  'f0000000-0000-4000-8000-000000000002'
);

reset role;

do $$
declare
  v_order_a uuid;
begin
  select id into v_order_a
  from public.orders
  where special_instructions = 'MIR order A';

  perform set_config('test.mir_order_a', v_order_a::text, false);
end;
$$;

-- ============================================================
-- Security / table hardening
-- ============================================================

select ok(
  has_table_privilege('authenticated', 'private.menu_item_ratings', 'SELECT') = false
  and has_table_privilege('authenticated', 'private.menu_item_ratings', 'INSERT') = false,
  'authenticated cannot access private.menu_item_ratings directly'
);

reset role;
select set_config('request.jwt.claims', '', false);
select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 5) $$,
  'P0001',
  'Authentication required',
  'anonymous cannot rate'
);

-- ============================================================
-- Eligibility before delivery
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 4) $$,
  'P0001',
  'A verified delivery is required before rating this item',
  'undelivered order does not grant eligibility'
);

-- Disable provider ratings
reset role;
update public.lunch_providers set ratings_enabled = false where id = '88888888-8888-4888-8888-888888888888';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') $$,
  'P0001',
  'Menu item ratings are not available',
  'disabled provider blocks summary'
);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 4) $$,
  'P0001',
  'Menu item ratings are not available',
  'disabled provider blocks upsert'
);

reset role;
update public.lunch_providers set ratings_enabled = true where id = '88888888-8888-4888-8888-888888888888';

-- Mark deliveries
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.mark_order_delivered(current_setting('test.mir_order_a')::uuid, '2099-01-09'::date);

select public.mark_order_delivered(
  (select id from public.orders where special_instructions = 'MIR order B'),
  '2099-01-09'::date
);

-- ============================================================
-- Successful ratings + aggregation
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 4) $$,
  'staff can rate after verified delivery'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 2) $$,
  'second staff rating contributes to aggregate'
);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'average_stars')::numeric,
  3.00::numeric,
  'average uses equal weight across valid staff ratings'
);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'rating_count')::bigint,
  2::bigint,
  'rating count includes all valid staff ratings'
);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'my_stars')::integer,
  2,
  'summary exposes caller own stars only'
);

-- ============================================================
-- Update requires another qualifying delivery
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 5) $$,
  'P0001',
  'Another qualifying delivery is required to update your rating',
  'cannot change stars without a newer qualifying delivery'
);

reset role;

do $$
declare
  v_order_item_id uuid;
begin
  select mir.source_order_item_id
  into v_order_item_id
  from private.menu_item_ratings mir
  where mir.profile_id = '22222222-2222-4222-8222-222222222222'
    and mir.provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
  limit 1;

  delete from public.order_items where id = v_order_item_id;
end;
$$;

select ok(
  (
    select source_order_item_id is null
    from private.menu_item_ratings
    where profile_id = '22222222-2222-4222-8222-222222222222'
      and provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
      and menu_item_generation = 1
  ),
  'rating line reference nulls when source order item is removed'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- Second order for staff A (2099-01-12)
select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-12'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR order A2',
  'f0000000-0000-4000-8000-000000000001'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.mark_order_delivered(
  (select id from public.orders where special_instructions = 'MIR order A2'),
  '2099-01-12'::date
);

reset role;

update public.order_delivery_events e
set created_at = e.created_at + interval '10 minutes'
from public.orders o
where o.id = e.order_id
  and o.special_instructions = 'MIR order A2'
  and e.event_type = 'marked_delivered';

select is(
  (
    select lo.order_id
    from private.latest_qualifying_menu_item_rating_delivery(
      '11111111-1111-4111-8111-111111111111',
      'a1111111-1111-4111-8111-111111111111'
    ) lo
  ),
  (select id from public.orders where special_instructions = 'MIR order A2'),
  'latest qualifying delivery uses newest verified order'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 5) $$,
  'staff can update after another verified delivery'
);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'average_stars')::numeric,
  3.50::numeric,
  'updated rating changes aggregate average'
);

-- ============================================================
-- HR-removed ratings cannot be resubmitted same generation
-- ============================================================

reset role;

update private.menu_item_ratings
set
  removed_at = now(),
  removed_by = '33333333-3333-4333-8333-333333333333',
  removal_reason = 'test removal'
where profile_id = '11111111-1111-4111-8111-111111111111'
  and provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 3) $$,
  'P0001',
  'This rating was removed and cannot be resubmitted for the current period',
  'removed rating blocks resubmit in same generation'
);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'rating_count')::bigint,
  1::bigint,
  'removed ratings excluded from aggregate count'
);

-- ============================================================
-- Delivery reversal voids eligibility
-- ============================================================

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.revert_order_delivery_to_pending(
  (select id from public.orders where special_instructions = 'MIR order B')
);

reset role;

select ok(
  (
    select eligibility_voided_at is not null
    from private.menu_item_ratings
    where profile_id = '22222222-2222-4222-8222-222222222222'
      and provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'delivery reversal voids existing rating eligibility'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'rating_count')::bigint,
  0::bigint,
  'voided ratings excluded from aggregate'
);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 3) $$,
  'P0001',
  'A verified delivery is required before rating this item',
  'voided rating cannot restore without a new qualifying delivery'
);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-15'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR order B3',
  'f0000000-0000-4000-8000-000000000002'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.mark_order_delivered(
  (select id from public.orders where special_instructions = 'MIR order B3'),
  '2099-01-15'::date
);

reset role;

update public.order_delivery_events e
set created_at = e.created_at + interval '10 minutes'
from public.orders o
where o.id = e.order_id
  and o.special_instructions = 'MIR order B3'
  and e.event_type = 'marked_delivered';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 4) $$,
  'voided rating can be restored after a new qualifying delivery'
);

reset role;

select ok(
  (
    select eligibility_voided_at is null
      and removed_at is null
    from private.menu_item_ratings
    where profile_id = '22222222-2222-4222-8222-222222222222'
      and provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'restored rating clears delivery invalidation without HR removal'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'rating_count')::bigint,
  1::bigint,
  'restored voided rating contributes to aggregate again'
);

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.report_order_delivery_issue_resolved_no_charge(
  (select id from public.orders where special_instructions = 'MIR order B3'),
  'not_delivered',
  'atomic no charge path'
);

reset role;

select ok(
  (
    select eligibility_voided_at is not null
      and removed_at is null
    from private.menu_item_ratings
    where profile_id = '22222222-2222-4222-8222-222222222222'
      and provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'report_order_delivery_issue_resolved_no_charge voids ratings via charge_waived'
);

-- ============================================================
-- Resolved issue: replacement qualifies; charge waiver does not
-- ============================================================

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-13'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR issue order',
  'f0000000-0000-4000-8000-000000000002'
);

reset role;

do $$
declare
  v_issue_order uuid;
begin
  select id into v_issue_order from public.orders where special_instructions = 'MIR issue order';
  perform set_config('test.mir_issue_order', v_issue_order::text, false);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.mark_order_delivered(current_setting('test.mir_issue_order')::uuid, '2099-01-13'::date);
select public.report_order_delivery_issue(current_setting('test.mir_issue_order')::uuid, 'not_delivered', 'missing meal', null);
select public.resolve_order_no_charge(current_setting('test.mir_issue_order')::uuid, 'waived');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 3) $$,
  'P0001',
  'A verified delivery is required before rating this item',
  'charge waiver without replacement does not grant eligibility'
);

-- Replacement path
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select public.submit_provider_order(
  '88888888-8888-4888-8888-888888888888',
  '2099-01-14'::date,
  '{"meal_quantity":1,"main_provider_menu_item_id":"a1111111-1111-4111-8111-111111111111","side_provider_menu_item_ids":["a2222222-2222-4222-8222-222222222222"],"standalone_items":[]}'::jsonb,
  'MIR replacement order',
  'f0000000-0000-4000-8000-000000000002'
);

reset role;

do $$
begin
  perform set_config(
    'test.mir_replacement_order',
    (select id::text from public.orders where special_instructions = 'MIR replacement order'),
    false
  );
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select public.mark_order_delivered(current_setting('test.mir_replacement_order')::uuid, '2099-01-14'::date);
select public.report_order_delivery_issue(current_setting('test.mir_replacement_order')::uuid, 'wrong_order', 'wrong item', null);
select public.confirm_order_delivery_resolved(current_setting('test.mir_replacement_order')::uuid, '2099-01-14'::date);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 3) $$,
  'replacement_delivered grants eligibility on resolved orders'
);

reset role;

select ok(
  (
    select eligibility_voided_at is null
    from private.menu_item_ratings
    where profile_id = '22222222-2222-4222-8222-222222222222'
      and provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
      and menu_item_generation = 1
  ),
  'replacement delivery upsert clears prior void state on same generation row'
);

-- ============================================================
-- Generation bump excludes prior-generation rows from summary
-- ============================================================

reset role;

select is(
  private.bump_provider_menu_item_rating_generation('a1111111-1111-4111-8111-111111111111'),
  2,
  'generation bump returns new generation'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (public.get_staff_menu_item_rating_summary('a1111111-1111-4111-8111-111111111111') ->> 'rating_count')::bigint,
  0::bigint,
  'prior generation ratings excluded after item reset'
);

-- ============================================================
-- Support Mode read-only for mutations
-- ============================================================

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.start_support_session('hr', 'mir rating test') $$,
  'admin can start HR support session for rating test'
);

select throws_ok(
  $$ select public.upsert_my_menu_item_rating('a1111111-1111-4111-8111-111111111111', 5) $$,
  'P0001',
  'Support Mode is read-only',
  'support mode blocks rating mutations'
);

-- ============================================================
-- Uniqueness / concurrency guard
-- ============================================================

reset role;

do $$
declare
  v_order_id uuid;
  v_order_item_id uuid;
begin
  select o.id, oi.id
  into v_order_id, v_order_item_id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.special_instructions = 'MIR replacement order'
    and mi.provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
  limit 1;

  if v_order_id is null then
    raise exception 'fixture missing replacement order line for concurrency test';
  end if;

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
  values (
    '22222222-2222-4222-8222-222222222222',
    'a1111111-1111-4111-8111-111111111111',
    '88888888-8888-4888-8888-888888888888',
    2,
    1,
    4,
    v_order_id,
    v_order_item_id,
    now()
  );
end;
$$;

select ok(true, 'first rating row in new generation can be inserted');

select throws_ok(
  $$
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
    values (
      '22222222-2222-4222-8222-222222222222',
      'a1111111-1111-4111-8111-111111111111',
      '88888888-8888-4888-8888-888888888888',
      2,
      1,
      5,
      (
        select o.id
        from public.orders o
        where o.special_instructions = 'MIR replacement order'
        limit 1
      ),
      (
        select oi.id
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        join public.menu_items mi on mi.id = oi.menu_item_id
        where o.special_instructions = 'MIR replacement order'
          and mi.provider_menu_item_id = 'a1111111-1111-4111-8111-111111111111'
        limit 1
      ),
      now()
    )
  $$,
  '23505',
  null,
  'one rating row per profile item generation enforced'
);

select * from finish();

rollback;
