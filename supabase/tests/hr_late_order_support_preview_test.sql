begin;

select plan(30);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d7111111-1111-4111-8111-111111111111', 'preview-hr@test.local', '{"full_name":"Preview HR"}'),
  ('d7222222-2222-4222-8222-222222222222', 'jose.preview@test.local', '{"full_name":"José Preview Staff"}'),
  ('d7333333-3333-4333-8333-333333333333', 'preview-admin@test.local', '{"full_name":"Preview Admin"}'),
  ('d7444444-4444-4444-8444-444444444444', 'preview-owner@test.local', '{"full_name":"Preview Owner"}'),
  ('d7555555-5555-4555-8555-555555555555', 'preview-accounts@test.local', '{"full_name":"Preview Accounts"}');

insert into auth.users (id, email, raw_user_meta_data)
select
  gen_random_uuid(),
  'bounded-preview-' || sequence || '@test.local',
  jsonb_build_object('full_name', 'Bounded Preview ' || sequence)
from generate_series(1, 25) as sequence;

reset role;
select private.apply_profile_role('d7111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('d7222222-2222-4222-8222-222222222222', 'staff');
select private.apply_profile_role('d7333333-3333-4333-8333-333333333333', 'admin');
select private.apply_profile_role('d7444444-4444-4444-8444-444444444444', 'owner');
select private.apply_profile_role('d7555555-5555-4555-8555-555555555555', 'accounts');

\ir support/assign_test_office_defaults.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (
  id, name, active, accepts_late_orders, late_order_deadline_day,
  late_order_deadline_time, supplemental_dispatch_mode, primary_order_email
)
values (
  'dd111111-1111-4111-8111-111111111111', 'Support Preview Provider', true, true,
  'delivery_day', '12:00:00', 'manual', 'provider-preview@example.test'
);

insert into public.provider_menu_items (
  id, provider_id, name, description, price, item_type, unit_label, active
)
values (
  'dd211111-1111-4111-8111-111111111111',
  'dd111111-1111-4111-8111-111111111111',
  'Read-only preview meal', 'No snapshot should be created', 42.50,
  'standalone', 'Each', true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'dd211111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday;

\ir support/late_order_cycle.inc

select set_config(
  'test.preview_lunch_day_count',
  (select count(*)::text from public.lunch_days where provider_id = 'dd111111-1111-4111-8111-111111111111'),
  false
);

select is(
  (select prosecdef from pg_proc where oid = 'public.search_hr_late_order_preview_employees(text,integer)'::regprocedure),
  true,
  'Preview employee search is SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.search_hr_late_order_preview_employees(text,integer)'::regprocedure),
  array['search_path=""'],
  'Preview employee search has an empty search path'
);
select is(
  (select provolatile from pg_proc where oid = 'public.preview_hr_late_order_menu(uuid,date,uuid,uuid)'::regprocedure),
  's'::"char",
  'Preview menu RPC is stable and cannot execute writes'
);
select is(
  (select proconfig from pg_proc where oid = 'public.preview_hr_late_order_menu(uuid,date,uuid,uuid)'::regprocedure),
  array['search_path=""'],
  'Preview menu RPC has an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.search_hr_late_order_preview_employees(text,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.preview_hr_late_order_menu(uuid,date,uuid,uuid)', 'execute'),
  'Authenticated callers may reach both guarded preview RPCs'
);
select ok(
  not has_function_privilege('anon', 'public.search_hr_late_order_preview_employees(text,integer)', 'execute')
  and not has_function_privilege('anon', 'public.preview_hr_late_order_menu(uuid,date,uuid,uuid)', 'execute'),
  'Anonymous callers have no preview RPC execute grants'
);
select ok(
  not has_function_privilege('service_role', 'public.search_hr_late_order_preview_employees(text,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.preview_hr_late_order_menu(uuid,date,uuid,uuid)', 'execute'),
  'Service credentials do not bypass the authenticated human preview boundary'
);
select results_eq(
  $$
    select p.proname, r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.oid in (
      'public.search_hr_late_order_preview_employees(text,integer)'::regprocedure,
      'public.preview_hr_late_order_menu(uuid,date,uuid,uuid)'::regprocedure
    )
    order by p.proname
  $$,
  $$
    values
      ('preview_hr_late_order_menu'::name, 'postgres'::name),
      ('search_hr_late_order_preview_employees'::name, 'postgres'::name)
  $$,
  'Both preview RPCs retain hardened postgres ownership'
);
select is(
  (
    select string_agg(parameter_name || ':' || data_type, ',' order by ordinal_position)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'search_hr_late_order_preview_employees_%'
      and parameter_mode = 'OUT'
  ),
  'profile_id:uuid,full_name:text,email:text',
  'Employee preview exposes only internal profile UUID, name, and email'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd7111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  $$ select public.search_hr_late_order_preview_employees('jose', 20) $$,
  'Permanent HR can search the preview directory'
);
select is(
  (select count(*) from public.search_hr_late_order_preview_employees('jose', 20)),
  1::bigint,
  'Preview employee search is accent insensitive'
);
select is(
  (select count(*) from public.search_hr_late_order_preview_employees('', 20)),
  0::bigint,
  'Empty employee search cannot enumerate the directory'
);
select is(
  (select count(*) from public.search_hr_late_order_preview_employees('bounded-preview', 500)),
  20::bigint,
  'Search caps a caller-supplied large limit at twenty results'
);
select lives_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, 'd7222222-2222-4222-8222-222222222222') $$,
  'Permanent HR can use the read-only menu preview'
);

reset role;
insert into private.support_sessions (
  actor_profile_id, actor_role, scope, reason, expires_at
)
values
  ('d7333333-3333-4333-8333-333333333333', 'admin', 'hr', 'Preview test', now() + interval '30 minutes'),
  ('d7444444-4444-4444-8444-444444444444', 'owner', 'hr', 'Preview test', now() + interval '30 minutes');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd7333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  $$ select public.search_hr_late_order_preview_employees('preview', 20) $$,
  'Active Admin HR Support can search the preview directory'
);
select lives_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, 'd7222222-2222-4222-8222-222222222222') $$,
  'Active Admin HR Support can preview a menu'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, 'd7222222-2222-4222-8222-222222222222') $$,
  'P0001', 'HR late-order access required',
  'Active Admin HR Support still cannot invoke the materializing menu RPC'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd7444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'Active Owner HR Support can preview a menu'
);

reset role;
select is(
  (select count(*) from public.lunch_days where provider_id = 'dd111111-1111-4111-8111-111111111111'),
  current_setting('test.preview_lunch_day_count')::bigint,
  'Preview calls do not materialize a lunch day'
);
select is(
  (select count(*) from public.orders o join public.lunch_days ld on ld.id = o.lunch_day_id where ld.provider_id = 'dd111111-1111-4111-8111-111111111111'),
  0::bigint,
  'Preview calls do not create orders'
);
select is(
  (select count(*) from public.provider_late_order_dispatches where provider_id = 'dd111111-1111-4111-8111-111111111111'),
  0::bigint,
  'Preview calls do not create dispatches'
);

update private.support_sessions
set ended_at = now(), ended_reason = 'test_expired'
where actor_profile_id = 'd7333333-3333-4333-8333-333333333333';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd7333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ select public.search_hr_late_order_preview_employees('preview', 20) $$,
  'P0001', 'HR late-order access required',
  'Expired HR Support cannot search preview employees'
);
select throws_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'P0001', 'HR late-order access required',
  'Expired HR Support cannot preview menus'
);

reset role;
update private.support_sessions
set ended_at = now(), ended_reason = 'test_scope_change'
where actor_profile_id = 'd7444444-4444-4444-8444-444444444444'
  and ended_at is null;

insert into private.support_sessions (
  actor_profile_id, actor_role, scope, reason, expires_at
)
values ('d7444444-4444-4444-8444-444444444444', 'owner', 'accounts', 'Wrong scope', now() + interval '30 minutes');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd7444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ select public.search_hr_late_order_preview_employees('preview', 20) $$,
  'P0001', 'HR late-order access required',
  'Accounts Support cannot search preview employees'
);
select throws_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'P0001', 'HR late-order access required',
  'Accounts Support cannot preview menus'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd7222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ select public.search_hr_late_order_preview_employees('preview', 20) $$,
  'P0001', 'HR late-order access required',
  'Staff cannot search preview employees'
);
select throws_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'P0001', 'HR late-order access required',
  'Staff cannot preview menus'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select throws_ok(
  $$ select public.search_hr_late_order_preview_employees('preview', 20) $$,
  null,
  'Anonymous callers cannot execute preview employee search'
);
select throws_ok(
  $$ select public.preview_hr_late_order_menu('dd111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  null,
  'Anonymous callers cannot execute menu preview'
);

reset role;
select is(
  (select count(*) from public.lunch_days where provider_id = 'dd111111-1111-4111-8111-111111111111'),
  current_setting('test.preview_lunch_day_count')::bigint,
  'Denied preview calls leave materialized menu state unchanged'
);

select * from finish();
rollback;
