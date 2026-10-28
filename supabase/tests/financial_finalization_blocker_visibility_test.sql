begin;

select plan(40);

\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('81000000-0000-4000-8000-000000000001', 'bug8-staff@test.local', '{"full_name":"Bug Eight Staff"}'),
  ('81000000-0000-4000-8000-000000000002', 'bug8-hr@test.local', '{"full_name":"Bug Eight HR"}'),
  ('81000000-0000-4000-8000-000000000003', 'bug8-accounts@test.local', '{"full_name":"Bug Eight Accounts"}'),
  ('81000000-0000-4000-8000-000000000004', 'bug8-admin@test.local', '{"full_name":"Bug Eight Admin"}');

select private.apply_profile_role('81000000-0000-4000-8000-000000000002', 'hr');
select private.apply_profile_role('81000000-0000-4000-8000-000000000003', 'accounts');
select private.apply_profile_role('81000000-0000-4000-8000-000000000004', 'admin');

insert into public.lunch_providers (id, name, active, primary_order_email)
values (
  '82000000-0000-4000-8000-000000000001',
  'Bug Eight Provider',
  true,
  'bug8-provider@example.test'
);

select set_config('app.allow_lunch_period_write', 'true', true);
insert into public.lunch_periods (id, label, start_date, end_date, is_current)
values
  ('83000000-0000-4000-8000-000000000001', 'Bug Eight Period', '2026-01-01', '2026-01-31', false),
  ('83000000-0000-4000-8000-000000000002', 'Bug Eight Bulk', '2030-01-01', '2031-05-16', false);
select set_config('app.allow_lunch_period_write', '', true);

insert into public.lunch_days (
  id, lunch_date, order_deadline, status, notes, provider_id, order_date
)
select
  ('84000000-0000-4000-8000-' || lpad(day_number::text, 12, '0'))::uuid,
  ('2026-01-01'::date + day_number),
  ('2026-01-01 12:00:00+00'::timestamptz + (day_number || ' days')::interval),
  'open',
  'bug8 fixture',
  '82000000-0000-4000-8000-000000000001',
  ('2026-01-01'::date + day_number)
from generate_series(1, 6) day_number;

select private.activate_bypass_order_deadline();

insert into public.orders (
  id, profile_id, lunch_day_id, status, delivery_state, financial_disposition,
  delivery_issue_type, office_location_name
)
values
  ('85000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'submitted', 'pending', 'chargeable', null, 'Kingston'),
  ('85000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', 'submitted', 'issue_open', 'on_hold', 'not_delivered', 'Kingston'),
  ('85000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', 'fulfilled', 'delivered', 'on_hold', null, 'Montego Bay'),
  ('85000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000004', 'submitted', 'pending', 'on_hold', null, 'Montego Bay'),
  ('85000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000005', 'fulfilled', 'delivered', 'chargeable', null, 'Kingston'),
  ('85000000-0000-4000-8000-000000000006', '81000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000006', 'cancelled', 'pending', 'on_hold', null, 'Kingston');

create temporary table bug8_read_side_effect_baseline as
select
  (select count(*) from public.order_delivery_events) as delivery_events,
  (select count(*) from private.notification_delivery_log) as notification_deliveries,
  (select count(*) from private.email_delivery_queue) as queued_emails,
  (select count(*) from public.provider_primary_order_dispatches) as provider_dispatches;

select has_function(
  'public',
  'get_lunch_period_finalization_blockers',
  array['uuid'],
  'Safe finalization blocker RPC exists'
);
select has_function(
  'public',
  'get_hr_lunch_period_finalization_blocker_orders',
  array['uuid'],
  'HR blocker reconciliation RPC exists'
);
select has_trigger(
  'public',
  'orders',
  'guard_order_financial_period_mutation',
  'Order writes coordinate with financial finalization through a database trigger'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'private.guard_order_financial_period_mutation()'::regprocedure),
  'Financial-period order guard is hardened SECURITY DEFINER'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.guard_order_financial_period_mutation()',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.guard_order_financial_period_mutation()',
    'execute'
  )
  and not has_function_privilege(
    'public',
    'private.guard_order_financial_period_mutation()',
    'execute'
  ),
  'Application roles cannot invoke the order guard directly'
);
select has_trigger(
  'public',
  'lunch_days',
  'guard_lunch_day_financial_period_mutation',
  'Lunch-day period changes coordinate with order writes and financial finalization'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc
   where oid = 'private.guard_lunch_day_financial_period_mutation()'::regprocedure)
  and
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc
   where oid = 'private.lock_financial_periods_for_order_dates(date[])'::regprocedure),
  'Lunch-day and shared period-lock helpers are hardened SECURITY DEFINER functions'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.guard_lunch_day_financial_period_mutation()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.lock_financial_periods_for_order_dates(date[])',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.guard_lunch_day_financial_period_mutation()',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.lock_financial_periods_for_order_dates(date[])',
    'execute'
  )
  and not has_function_privilege(
    'public',
    'private.guard_lunch_day_financial_period_mutation()',
    'execute'
  )
  and not has_function_privilege(
    'public',
    'private.lock_financial_periods_for_order_dates(date[])',
    'execute'
  ),
  'Application roles cannot invoke lunch-day or shared period-lock helpers directly'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.get_lunch_period_finalization_blockers(uuid)'::regprocedure),
  'Safe blocker RPC is hardened SECURITY DEFINER'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.get_hr_lunch_period_finalization_blocker_orders(uuid)'::regprocedure),
  'HR blocker RPC is hardened SECURITY DEFINER'
);
select ok(
  has_function_privilege('authenticated', 'public.get_lunch_period_finalization_blockers(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_lunch_period_finalization_blockers(uuid)', 'execute')
  and not has_function_privilege('public', 'public.get_lunch_period_finalization_blockers(uuid)', 'execute'),
  'Only authenticated application callers receive execute on the safe blocker RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_hr_lunch_period_finalization_blocker_orders(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_hr_lunch_period_finalization_blocker_orders(uuid)', 'execute')
  and not has_function_privilege('public', 'public.get_hr_lunch_period_finalization_blocker_orders(uuid)', 'execute'),
  'Only authenticated application callers receive execute on the HR blocker RPC'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);

select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'total')::integer,
  4,
  'Permanent Accounts sees each blocked order once'
);
select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'pending_delivery')::integer,
  1,
  'Pending-only order is counted in the pending category'
);
select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'open_issue')::integer,
  1,
  'Overlapping open issue is counted once in the open-issue category'
);
select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'financial_hold')::integer,
  2,
  'Remaining financial holds are counted once in the hold category'
);
select is(
  private.count_unreconciled_delivery_orders('83000000-0000-4000-8000-000000000001'),
  4::bigint,
  'Finalization count uses the same authoritative blocker rows'
);
select throws_ok(
  $$ select public.finalize_lunch_period('83000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'This lunch period cannot be finalized because 4 order(s) still require delivery reconciliation.',
  'Authoritative finalization rejects exactly the detailed blocker total'
);
select ok(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'blockers')::text not like '%employee_id%'
  and (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'blockers')::text not like '%profile_id%'
  and (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'blockers')::text not like '%email%'
  and (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'blockers')::text not like '%total%'
  and (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'blockers')::text not like '%price%',
  'Accounts blocker payload excludes employee IDs, profile IDs, emails, and spending fields'
);
select throws_ok(
  $$ select public.get_hr_lunch_period_finalization_blocker_orders('83000000-0000-4000-8000-000000000001') $$,
  '42501',
  'HR operational order access is required',
  'Permanent Accounts cannot retrieve the richer HR reconciliation payload'
);

select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  jsonb_array_length(public.get_hr_lunch_period_finalization_blocker_orders('83000000-0000-4000-8000-000000000001')->'orders'),
  4,
  'Permanent HR receives the current period-scoped blocker orders'
);
select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'total')::integer,
  4,
  'Permanent HR can also read the safe blocker summary'
);

select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001') $$,
  '42501',
  'Financial finalization blocker access required',
  'Staff cannot retrieve blocker information'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'Anonymous callers cannot execute the blocker RPC'
);

reset role;
insert into private.support_sessions (
  actor_profile_id, actor_role, scope, reason, started_at, expires_at
)
values (
  '81000000-0000-4000-8000-000000000004', 'admin', 'accounts', 'bug8 accounts support', now(), now() + interval '30 minutes'
);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'total')::integer,
  4,
  'Active Accounts Support Mode can inspect safe blocker information'
);
select throws_ok(
  $$ select public.get_hr_lunch_period_finalization_blocker_orders('83000000-0000-4000-8000-000000000001') $$,
  '42501',
  'HR operational order access is required',
  'Accounts Support Mode cannot retrieve HR reconciliation details'
);

reset role;
update private.support_sessions set ended_at = now(), ended_reason = 'test switch' where ended_at is null;
insert into private.support_sessions (
  actor_profile_id, actor_role, scope, reason, started_at, expires_at
)
values (
  '81000000-0000-4000-8000-000000000004', 'admin', 'hr', 'bug8 hr support', now(), now() + interval '30 minutes'
);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
select is(
  jsonb_array_length(public.get_hr_lunch_period_finalization_blocker_orders('83000000-0000-4000-8000-000000000001')->'orders'),
  4,
  'Active HR Support Mode can inspect the reconciliation view'
);

reset role;
update private.support_sessions set expires_at = now() - interval '1 second' where ended_at is null;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.get_hr_lunch_period_finalization_blocker_orders('83000000-0000-4000-8000-000000000001') $$,
  '42501',
  'HR operational order access is required',
  'Expired HR Support Mode loses blocker access'
);

reset role;
select is(
  (select count(*) from public.order_delivery_events),
  (select delivery_events from bug8_read_side_effect_baseline),
  'Blocker reads do not create delivery audit events'
);
select is(
  (select count(*) from private.notification_delivery_log),
  (select notification_deliveries from bug8_read_side_effect_baseline),
  'Blocker reads do not create notification delivery records'
);
select is(
  (select count(*) from private.email_delivery_queue),
  (select queued_emails from bug8_read_side_effect_baseline),
  'Blocker reads do not queue email'
);
select is(
  (select count(*) from public.provider_primary_order_dispatches),
  (select provider_dispatches from bug8_read_side_effect_baseline),
  'Blocker reads do not create provider dispatches'
);

insert into public.lunch_days (lunch_date, order_deadline, status, notes, provider_id, order_date)
select
  '2030-01-01'::date + day_number,
  '2030-01-01 12:00:00+00'::timestamptz + (day_number || ' days')::interval,
  'open',
  'bug8 bulk fixture',
  '82000000-0000-4000-8000-000000000001',
  '2030-01-01'::date + day_number
from generate_series(0, 500) day_number;

insert into public.orders (profile_id, lunch_day_id, status, delivery_state, financial_disposition, office_location_name)
select
  '81000000-0000-4000-8000-000000000001',
  ld.id,
  'submitted',
  'pending',
  'chargeable',
  'Kingston'
from public.lunch_days ld
where ld.notes = 'bug8 bulk fixture';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
select is(
  jsonb_array_length(public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000002')->'blockers'),
  501,
  'Single JSON response returns more than 500 blocker records without PostgREST truncation'
);
select is(
  private.count_unreconciled_delivery_orders('83000000-0000-4000-8000-000000000002'),
  501::bigint,
  'Bulk detailed blocker result agrees with finalization count'
);

select throws_ok(
  $$ select public.get_lunch_period_finalization_blockers(null) $$,
  '22004',
  'Lunch period ID is required',
  'Malformed null period identifiers fail explicitly'
);
select throws_ok(
  $$ select public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000099') $$,
  '22023',
  'Lunch period does not exist',
  'Unknown period identifiers fail explicitly'
);

select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.mark_order_delivered('85000000-0000-4000-8000-000000000001') $$,
  'Permanent HR retains delivery reconciliation mutations'
);
select is(
  (public.get_lunch_period_finalization_blockers('83000000-0000-4000-8000-000000000001')->'counts'->>'total')::integer,
  3,
  'Resolved blockers disappear from a fresh authoritative read'
);
select is(
  private.count_unreconciled_delivery_orders('83000000-0000-4000-8000-000000000001'),
  3::bigint,
  'Detailed blocker count continues to agree after reconciliation'
);

select is(
  (select count(*) from public.order_delivery_events where order_id = '85000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Only the explicit HR reconciliation mutation creates an audit event'
);

select * from finish();
rollback;
