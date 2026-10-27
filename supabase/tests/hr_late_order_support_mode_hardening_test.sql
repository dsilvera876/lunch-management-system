begin;

select plan(43);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c7111111-1111-4111-8111-111111111111', 'hardening-hr@test.local', '{"full_name":"Hardening HR"}'),
  ('c7222222-2222-4222-8222-222222222222', 'hardening-staff@test.local', '{"full_name":"Hardening Staff"}'),
  ('c7333333-3333-4333-8333-333333333333', 'hardening-accounts@test.local', '{"full_name":"Hardening Accounts"}'),
  ('c7444444-4444-4444-8444-444444444444', 'hardening-admin@test.local', '{"full_name":"Hardening Admin"}'),
  ('c7555555-5555-4555-8555-555555555555', 'hardening-owner@test.local', '{"full_name":"Hardening Owner"}');

reset role;
select private.apply_profile_role('c7111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('c7222222-2222-4222-8222-222222222222', 'staff');
select private.apply_profile_role('c7333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('c7444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('c7555555-5555-4555-8555-555555555555', 'owner');

\ir support/assign_test_office_defaults.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (
  id,
  name,
  active,
  accepts_late_orders,
  late_order_deadline_day,
  late_order_deadline_time,
  supplemental_dispatch_mode,
  primary_order_email
)
values
  (
    'ca111111-1111-4111-8111-111111111111',
    'Hardening Claim Provider',
    true,
    true,
    'delivery_day',
    '12:00:00',
    'manual',
    'hardening-claim@example.test'
  ),
  (
    'cb111111-1111-4111-8111-111111111111',
    'Hardening Dispatch Provider',
    true,
    true,
    'delivery_day',
    '12:00:00',
    'manual',
    'hardening-dispatch@example.test'
  ),
  (
    'cc111111-1111-4111-8111-111111111111',
    'Hardening Menu Provider',
    true,
    true,
    'delivery_day',
    '12:00:00',
    'manual',
    'hardening-menu@example.test'
  );

insert into public.provider_menu_items (
  id,
  provider_id,
  name,
  price,
  item_type,
  unit_label,
  active
)
values
  (
    'ca211111-1111-4111-8111-111111111111',
    'ca111111-1111-4111-8111-111111111111',
    'Hardening Claim Meal',
    25.00,
    'standalone',
    'Each',
    true
  ),
  (
    'cc211111-1111-4111-8111-111111111111',
    'cc111111-1111-4111-8111-111111111111',
    'Hardening Preview Meal',
    30.00,
    'standalone',
    'Each',
    true
  );

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select item_id, weekday
from (
  values
    ('ca211111-1111-4111-8111-111111111111'::uuid),
    ('cc211111-1111-4111-8111-111111111111'::uuid)
) as items(item_id)
cross join generate_series(1, 5) as weekday;

\ir support/late_order_cycle.inc

select private.ensure_provider_lunch_day(
  'ca111111-1111-4111-8111-111111111111',
  current_setting('test.late_order_date')::date
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.create_hr_late_order(
      'c7222222-2222-4222-8222-222222222222',
      'ca111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object('menu_item_id', mi.id, 'quantity', 1)
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'ca111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.late_order_date')::date
        limit 1
      ),
      null,
      'f0000000-0000-4000-8000-000000000001'
    )
  $$,
  'Permanent HR can create the eligible late order used by dispatch tests'
);

reset role;

insert into public.provider_late_order_dispatches (
  id,
  provider_id,
  scheduled_delivery_date,
  dispatch_type,
  status,
  provider_email,
  message_metadata,
  worker_source
)
values
  (
    'cd111111-1111-4111-8111-111111111111',
    'cb111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date + 10,
    'manual',
    'pending',
    'hardening-dispatch@example.test',
    jsonb_build_object('order_ids', '[]'::jsonb),
    'manual_hr'
  ),
  (
    'cd222222-2222-4222-8222-222222222222',
    'cb111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date + 11,
    'manual',
    'attention_required',
    'hardening-dispatch@example.test',
    jsonb_build_object('order_ids', '[]'::jsonb),
    'manual_hr'
  ),
  (
    'cd333333-3333-4333-8333-333333333333',
    'cb111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date + 12,
    'manual',
    'attention_required',
    'hardening-dispatch@example.test',
    jsonb_build_object('order_ids', '[]'::jsonb),
    'manual_hr'
  ),
  (
    'cd444444-4444-4444-8444-444444444444',
    'cb111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date + 13,
    'automatic',
    'pending',
    'hardening-dispatch@example.test',
    jsonb_build_object('order_ids', '[]'::jsonb),
    'automatic_worker'
  );

delete from public.lunch_days
where provider_id = 'cc111111-1111-4111-8111-111111111111';

select ok(
  (
    select bool_and(
      position('private.can_manage_hr_operational_data()' in lower(pg_get_functiondef(p.oid))) > 0
      and position('private.can_view_all_orders()' in lower(pg_get_functiondef(p.oid))) = 0
    )
    from pg_proc p
    where p.oid in (
      'public.claim_provider_late_order_supplement(uuid,date)'::regprocedure,
      'public.finalize_provider_late_order_supplement(uuid,boolean,text,jsonb,boolean)'::regprocedure,
      'public.acknowledge_provider_late_order_dispatch_not_received(uuid)'::regprocedure,
      'public.acknowledge_provider_late_order_dispatch_received(uuid)'::regprocedure,
      'public.fetch_hr_late_order_snapshot_menu(uuid,date,uuid)'::regprocedure
    )
  ),
  'All hardened human RPCs use permanent-HR mutation authorization only'
);

select ok(
  (
    select bool_and(p.prosecdef and p.proconfig = array['search_path=""']::text[])
    from pg_proc p
    where p.oid in (
      'public.claim_provider_late_order_supplement(uuid,date)'::regprocedure,
      'public.finalize_provider_late_order_supplement(uuid,boolean,text,jsonb,boolean)'::regprocedure,
      'public.acknowledge_provider_late_order_dispatch_not_received(uuid)'::regprocedure,
      'public.acknowledge_provider_late_order_dispatch_received(uuid)'::regprocedure,
      'public.fetch_hr_late_order_snapshot_menu(uuid,date,uuid)'::regprocedure
    )
  ),
  'All hardened RPCs remain SECURITY DEFINER with an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.claim_provider_late_order_supplement(uuid,date)', 'execute')
  and has_function_privilege('authenticated', 'public.finalize_provider_late_order_supplement(uuid,boolean,text,jsonb,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.acknowledge_provider_late_order_dispatch_not_received(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.acknowledge_provider_late_order_dispatch_received(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.fetch_hr_late_order_snapshot_menu(uuid,date,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_provider_late_order_supplement(uuid,date)', 'execute')
  and not has_function_privilege('anon', 'public.finalize_provider_late_order_supplement(uuid,boolean,text,jsonb,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.acknowledge_provider_late_order_dispatch_not_received(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.acknowledge_provider_late_order_dispatch_received(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.fetch_hr_late_order_snapshot_menu(uuid,date,uuid)', 'execute'),
  'Authenticated and anonymous execution grants remain appropriately scoped'
);

select ok(
  has_function_privilege('service_role', 'public.worker_claim_automatic_provider_late_order_supplement(uuid,date)', 'execute')
  and has_function_privilege('service_role', 'public.worker_finalize_provider_late_order_supplement(uuid,boolean,text,jsonb,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.worker_claim_automatic_provider_late_order_supplement(uuid,date)', 'execute')
  and not has_function_privilege('authenticated', 'public.worker_finalize_provider_late_order_supplement(uuid,boolean,text,jsonb,boolean)', 'execute'),
  'Service-only worker function grants remain unchanged'
);

-- Active Admin HR Support Mode remains read-only at the database boundary.
insert into private.support_sessions (
  actor_profile_id,
  actor_role,
  scope,
  reason,
  expires_at
)
values (
  'c7444444-4444-4444-8444-444444444444',
  'admin',
  'hr',
  'Phase A Admin support-mode regression',
  now() + interval '30 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.claim_provider_late_order_supplement('ca111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date) $$,
  'P0001',
  'HR late-order access required',
  'Active Admin HR Support cannot claim a dispatch'
);
select throws_ok(
  $$ select public.finalize_provider_late_order_supplement('cd111111-1111-4111-8111-111111111111', false, 'blocked') $$,
  'P0001',
  'HR late-order access required',
  'Active Admin HR Support cannot finalize a dispatch'
);
select throws_ok(
  $$ select public.acknowledge_provider_late_order_dispatch_not_received('cd222222-2222-4222-8222-222222222222') $$,
  'P0001',
  'HR late-order access required',
  'Active Admin HR Support cannot acknowledge a dispatch as not received'
);
select throws_ok(
  $$ select public.acknowledge_provider_late_order_dispatch_received('cd333333-3333-4333-8333-333333333333') $$,
  'P0001',
  'HR late-order access required',
  'Active Admin HR Support cannot acknowledge a dispatch as received'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('cc111111-1111-4111-8111-111111111111', public.delivery_date_for_order_date(current_setting('test.jamaica_today')::date), null) $$,
  'P0001',
  'HR late-order access required',
  'Active Admin HR Support cannot invoke snapshot materialization'
);

reset role;
select is(
  (select count(*) from public.provider_late_order_dispatches where provider_id = 'ca111111-1111-4111-8111-111111111111'),
  0::bigint,
  'Denied Admin claim creates no dispatch record'
);
select is(
  (select status from public.provider_late_order_dispatches where id = 'cd111111-1111-4111-8111-111111111111'),
  'pending'::text,
  'Denied Admin finalize leaves the dispatch pending'
);
select results_eq(
  $$
    select id, status
    from public.provider_late_order_dispatches
    where id in (
      'cd222222-2222-4222-8222-222222222222',
      'cd333333-3333-4333-8333-333333333333'
    )
    order by id
  $$,
  $$
    values
      ('cd222222-2222-4222-8222-222222222222'::uuid, 'attention_required'::text),
      ('cd333333-3333-4333-8333-333333333333'::uuid, 'attention_required'::text)
  $$,
  'Denied Admin acknowledgements preserve both attention-required dispatches'
);
select is(
  (select count(*) from public.provider_late_order_dispatch_reviews where dispatch_id in (
    'cd222222-2222-4222-8222-222222222222',
    'cd333333-3333-4333-8333-333333333333'
  )),
  0::bigint,
  'Denied Admin acknowledgements create no review records'
);
select is(
  (select count(*) from public.lunch_days where provider_id = 'cc111111-1111-4111-8111-111111111111'),
  0::bigint,
  'Denied Admin menu loading materializes no lunch-day snapshot'
);

update private.support_sessions
set ended_at = now(), ended_reason = 'test_scope_change'
where actor_profile_id = 'c7444444-4444-4444-8444-444444444444'
  and ended_at is null;

-- Active Owner HR Support Mode is subject to the same four mutation denials.
insert into private.support_sessions (
  actor_profile_id,
  actor_role,
  scope,
  reason,
  expires_at
)
values (
  'c7555555-5555-4555-8555-555555555555',
  'owner',
  'hr',
  'Phase A Owner support-mode regression',
  now() + interval '30 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ select public.claim_provider_late_order_supplement('ca111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date) $$,
  'P0001', 'HR late-order access required',
  'Active Owner HR Support cannot claim a dispatch'
);
select throws_ok(
  $$ select public.finalize_provider_late_order_supplement('cd111111-1111-4111-8111-111111111111', false, 'blocked') $$,
  'P0001', 'HR late-order access required',
  'Active Owner HR Support cannot finalize a dispatch'
);
select throws_ok(
  $$ select public.acknowledge_provider_late_order_dispatch_not_received('cd222222-2222-4222-8222-222222222222') $$,
  'P0001', 'HR late-order access required',
  'Active Owner HR Support cannot acknowledge not received'
);
select throws_ok(
  $$ select public.acknowledge_provider_late_order_dispatch_received('cd333333-3333-4333-8333-333333333333') $$,
  'P0001', 'HR late-order access required',
  'Active Owner HR Support cannot acknowledge received'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('cc111111-1111-4111-8111-111111111111', public.delivery_date_for_order_date(current_setting('test.jamaica_today')::date), null) $$,
  'P0001', 'HR late-order access required',
  'Active Owner HR Support cannot invoke snapshot materialization'
);

reset role;
select is(
  (select count(*) from public.provider_late_order_dispatches where provider_id = 'ca111111-1111-4111-8111-111111111111'),
  0::bigint,
  'Denied Owner operations preserve claim state'
);
select is(
  (select count(*) from public.provider_late_order_dispatch_reviews),
  0::bigint,
  'Denied Owner operations preserve dispatch review state'
);

update private.support_sessions
set ended_at = now(), ended_reason = 'test_scope_change'
where actor_profile_id = 'c7555555-5555-4555-8555-555555555555'
  and ended_at is null;

-- Expired HR Support, Accounts Support, Staff, and anonymous callers remain denied.
insert into private.support_sessions (
  actor_profile_id,
  actor_role,
  scope,
  reason,
  started_at,
  expires_at
)
values (
  'c7444444-4444-4444-8444-444444444444',
  'admin',
  'hr',
  'Expired Phase A regression',
  now() - interval '60 minutes',
  now() - interval '30 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ select public.claim_provider_late_order_supplement('ca111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date) $$,
  'P0001', 'HR late-order access required',
  'Expired HR Support cannot claim a dispatch'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('cc111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'P0001', 'HR late-order access required',
  'Expired HR Support cannot load a materializing menu'
);

reset role;
insert into private.support_sessions (
  actor_profile_id,
  actor_role,
  scope,
  reason,
  expires_at
)
values (
  'c7555555-5555-4555-8555-555555555555',
  'owner',
  'accounts',
  'Accounts scope Phase A regression',
  now() + interval '30 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ select public.claim_provider_late_order_supplement('ca111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date) $$,
  'P0001', 'HR late-order access required',
  'Accounts Support cannot claim a dispatch'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('cc111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'P0001', 'HR late-order access required',
  'Accounts Support cannot load a materializing menu'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ select public.claim_provider_late_order_supplement('ca111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date) $$,
  'P0001', 'HR late-order access required',
  'Staff cannot claim a dispatch'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('cc111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  'P0001', 'HR late-order access required',
  'Staff cannot load a materializing menu'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select throws_ok(
  $$ select public.claim_provider_late_order_supplement('ca111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date) $$,
  null,
  'Anonymous callers cannot execute dispatch claim'
);
select throws_ok(
  $$ select public.fetch_hr_late_order_snapshot_menu('cc111111-1111-4111-8111-111111111111', current_setting('test.late_delivery_date')::date, null) $$,
  null,
  'Anonymous callers cannot execute snapshot menu loading'
);

-- Permanent HR retains human dispatch and menu behavior.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c7111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select set_config(
      'test.hardening_claim_dispatch_id',
      (public.claim_provider_late_order_supplement(
        'ca111111-1111-4111-8111-111111111111',
        current_setting('test.late_delivery_date')::date
      ) ->> 'dispatch_id'),
      false
    )
  $$,
  'Permanent HR can claim an eligible manual dispatch'
);
select lives_ok(
  $$
    select public.finalize_provider_late_order_supplement(
      current_setting('test.hardening_claim_dispatch_id')::uuid,
      false,
      'Intentional Phase A test failure'
    )
  $$,
  'Permanent HR can finalize its claimed manual dispatch'
);
select lives_ok(
  $$ select public.acknowledge_provider_late_order_dispatch_not_received('cd222222-2222-4222-8222-222222222222') $$,
  'Permanent HR can acknowledge a dispatch as not received'
);
select lives_ok(
  $$ select public.acknowledge_provider_late_order_dispatch_received('cd333333-3333-4333-8333-333333333333') $$,
  'Permanent HR can acknowledge a dispatch as received'
);
select lives_ok(
  $$
    select public.fetch_hr_late_order_snapshot_menu(
      'ca111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      'c7222222-2222-4222-8222-222222222222'
    )
  $$,
  'Permanent HR can load an existing late-order menu snapshot'
);
select is(
  (
    public.fetch_hr_late_order_snapshot_menu(
      'ca111111-1111-4111-8111-111111111111',
      current_setting('test.late_delivery_date')::date,
      'c7222222-2222-4222-8222-222222222222'
    ) ->> 'status'
  ),
  'available'::text,
  'Permanent HR menu loading returns the available snapshot'
);
select lives_ok(
  $$
    select public.fetch_hr_late_order_snapshot_menu(
      'cc111111-1111-4111-8111-111111111111',
      public.delivery_date_for_order_date(current_setting('test.jamaica_today')::date),
      null
    )
  $$,
  'Permanent HR can invoke current-cycle menu materialization when the calendar permits it'
);

reset role;
select ok(
  public.iso_weekday(current_setting('test.jamaica_today')::date) is null
  or exists (
    select 1
    from public.lunch_days
    where provider_id = 'cc111111-1111-4111-8111-111111111111'
      and order_date = current_setting('test.jamaica_today')::date
  ),
  'Permanent HR materializes the current menu snapshot on an ordering weekday'
);
select is(
  (select status from public.provider_late_order_dispatches where id = current_setting('test.hardening_claim_dispatch_id')::uuid),
  'failed'::text,
  'Permanent HR finalize preserves the existing failure transition'
);
select results_eq(
  $$
    select id, status
    from public.provider_late_order_dispatches
    where id in (
      'cd222222-2222-4222-8222-222222222222',
      'cd333333-3333-4333-8333-333333333333'
    )
    order by id
  $$,
  $$
    values
      ('cd222222-2222-4222-8222-222222222222'::uuid, 'failed'::text),
      ('cd333333-3333-4333-8333-333333333333'::uuid, 'sent'::text)
  $$,
  'Permanent HR acknowledgements preserve existing dispatch transitions'
);
select is(
  (select count(*) from public.provider_late_order_dispatch_reviews where dispatch_id in (
    'cd222222-2222-4222-8222-222222222222',
    'cd333333-3333-4333-8333-333333333333'
  )),
  2::bigint,
  'Permanent HR acknowledgements retain dispatch audit reviews'
);

-- The explicitly service-only worker finalizer remains independent and functional.
reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$
    select public.worker_finalize_provider_late_order_supplement(
      'cd444444-4444-4444-8444-444444444444',
      false,
      'Intentional worker compatibility test'
    )
  $$,
  'Service-role worker finalization remains functional'
);

reset role;
select is(
  (select status from public.provider_late_order_dispatches where id = 'cd444444-4444-4444-8444-444444444444'),
  'failed'::text,
  'Service-role worker finalization preserves the existing failure transition'
);

select * from finish();
rollback;
