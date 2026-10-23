begin;

select plan(18);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'ba000001-0000-4000-8000-000000000001',
    'snapshot-staff-a@test.local',
    '{"full_name":"Snapshot Staff A"}'
  ),
  (
    'ba000002-0000-4000-8000-000000000002',
    'snapshot-staff-b@test.local',
    '{"full_name":"Snapshot Staff B"}'
  );

\ir support/submit_order_lunch_day_fixture.inc

reset role;

update public.app_settings
set daily_lunch_subsidy = 30
where id = 1;

update public.lunch_providers
set icon_key = 'fruit'
where id = '90000000-0000-0000-0000-000000000099';

insert into public.orders (
  id,
  profile_id,
  lunch_day_id,
  status,
  financial_disposition,
  order_group_id,
  created_at,
  updated_at
)
select
  ('ba1' || lpad(series::text, 5, '0') || '-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'ba000001-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-0000-0000-000000000001'::uuid,
  'submitted',
  'chargeable',
  gen_random_uuid(),
  '2099-01-01 12:00:00+00'::timestamptz + series * interval '1 millisecond',
  '2099-01-01 12:00:00+00'::timestamptz + series * interval '1 millisecond'
from generate_series(1, 251) series;

insert into public.order_items (order_id, menu_item_id, quantity)
select
  o.id,
  '20000000-0000-0000-0000-000000000001'::uuid,
  1
from public.orders o
where o.profile_id = 'ba000001-0000-4000-8000-000000000001';

update public.orders
set status = 'fulfilled'
where profile_id = 'ba000001-0000-4000-8000-000000000001';

select set_config('app.allow_lunch_period_write', 'true', true);
insert into public.lunch_periods (
  id,
  label,
  start_date,
  end_date,
  status,
  finalized_daily_subsidy
)
values (
  'ba000010-0000-4000-8000-000000000010',
  'Snapshot finalized period',
  '2099-01-01',
  '2099-01-01',
  'finalized',
  12
);
select set_config('app.allow_lunch_period_write', '', true);

select has_function(
  'public',
  'get_my_orders_snapshot',
  array[]::text[],
  'The self-scoped My Orders snapshot RPC exists'
);

select is(
  pg_get_function_result('public.get_my_orders_snapshot()'::regprocedure),
  'jsonb',
  'The snapshot is returned as one JSON value rather than truncatable rows'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.get_my_orders_snapshot()'::regprocedure),
  true,
  'The snapshot RPC is SECURITY DEFINER'
);

select is(
  (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.get_my_orders_snapshot()'::regprocedure),
  'postgres',
  'The snapshot RPC has the hardened postgres owner'
);

select is(
  (select proconfig from pg_proc where oid = 'public.get_my_orders_snapshot()'::regprocedure),
  array['search_path=""']::text[],
  'The snapshot RPC has an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_orders_snapshot()', 'execute')
  and not has_function_privilege('anon', 'public.get_my_orders_snapshot()', 'execute')
  and not has_function_privilege('service_role', 'public.get_my_orders_snapshot()', 'execute'),
  'Only authenticated application callers receive an execution grant'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'ba000001-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

create temporary table staff_snapshot on commit drop as
select public.get_my_orders_snapshot() as payload;

select is(
  (select payload ->> 'snapshot_version' from staff_snapshot),
  '1',
  'The snapshot contract is versioned'
);

select is(
  (select payload ->> 'financial_context_valid' from staff_snapshot),
  'true',
  'Complete authoritative financial context is marked valid'
);

select is(
  (select jsonb_array_length(payload -> 'orders') from staff_snapshot),
  251,
  'More than 250 provider orders are returned without truncation'
);

select is(
  (
    select count(distinct item ->> 'id')::integer
    from staff_snapshot s
    cross join lateral jsonb_array_elements(s.payload -> 'orders') item
  ),
  251,
  'Every returned provider order has a unique identifier'
);

select is(
  (
    select count(*)::integer
    from staff_snapshot s
    cross join lateral jsonb_array_elements(s.payload -> 'orders') item
    where item ? 'profile_id'
  ),
  0,
  'The response does not disclose profile identifiers'
);

select is(
  (select payload #>> '{daily_subsidies,0,effective_daily_subsidy}' from staff_snapshot),
  '12.00',
  'A finalized period uses its authoritative subsidy snapshot instead of the current rate'
);

select is(
  (
    select count(*)::integer
    from staff_snapshot s
    cross join lateral jsonb_array_elements(s.payload -> 'orders') item
    where nullif(item ->> 'order_group_id', '') is not null
  ),
  251,
  'Complete checkout associations are returned for every provider order'
);

select is(
  (select payload #>> '{orders,0,lunch_days,lunch_providers,icon_key}' from staff_snapshot),
  'fruit',
  'The snapshot returns only the provider curated icon key needed for presentation'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'ba000002-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  jsonb_array_length(public.get_my_orders_snapshot() -> 'orders'),
  0,
  'A caller cannot retrieve another employee order history'
);

select set_config('request.jwt.claims', '{}'::jsonb::text, true);

select is(
  public.get_my_orders_snapshot(),
  null::jsonb,
  'An authenticated role without a linked active profile receives no snapshot'
);

reset role;
delete from public.order_items
where order_id = 'ba100001-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'ba000001-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  public.get_my_orders_snapshot() ->> 'financial_context_valid',
  'false',
  'Missing order-item context makes the complete snapshot fail closed'
);

select is(
  (
    select count(*)::integer
    from jsonb_array_elements(public.get_my_orders_snapshot() -> 'orders') item
    where item ->> 'status' = 'fulfilled'
  ),
  251,
  'Snapshot validation does not silently drop malformed order rows'
);

select * from finish();
rollback;
