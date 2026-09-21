begin;

select plan(8);

\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values (
  'f0000000-0000-4000-8000-000000000001',
  'fresh-home@test.local',
  '{"full_name":"Fresh User"}'
);

select results_eq(
  $$
    select full_name
    from public.profiles
    where id = 'f0000000-0000-4000-8000-000000000001'
  $$,
  array['Fresh User'::text],
  'Signup creates the matching profile'
);

select results_eq(
  $$
    select role
    from public.profiles
    where id = 'f0000000-0000-4000-8000-000000000001'
  $$,
  array['staff'::text],
  'A new profile defaults to Staff'
);

select results_eq(
  $$
    select default_office_location_id
    from public.profiles
    where id = 'f0000000-0000-4000-8000-000000000001'
  $$,
  array[null::uuid],
  'A new profile does not require a default office location'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.orders
    where profile_id = 'f0000000-0000-4000-8000-000000000001'
  $$,
  array[0::bigint],
  'A new profile has no orders'
);

select results_eq(
  $$ select count(*)::bigint from public.lunch_periods where is_current $$,
  array[0::bigint],
  'The empty fixture has no current lunch period'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f0000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$ select public.get_my_financial_dashboard() $$,
  'A fresh user can load the financial dashboard'
);

select results_eq(
  $$ select public.get_my_financial_dashboard() -> 'current_period' $$,
  array['null'::jsonb],
  'No current lunch period is returned as a legitimate null state'
);

select results_eq(
  $$
    select public.get_my_financial_dashboard() -> 'today'
  $$,
  array[
    '{"gross": 0.00, "subsidy_used": 0.00, "net_deduction": 0.00, "order_count": 0, "qualifying_order_days": 0}'::jsonb
  ],
  'A fresh user receives zero activity for today'
);

select * from finish();
rollback;
