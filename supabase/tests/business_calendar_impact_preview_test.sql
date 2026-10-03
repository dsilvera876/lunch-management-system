begin;

select plan(13);

-- A. Zero-impact future closure (no lunch_days, no submitted orders)
\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-4333-8333-333333333333', 'hr-zero-impact@test.local', '{"full_name":"HR Zero"}');

select private.apply_profile_role('33333333-3333-4333-8333-333333333333', 'hr');

reset role;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '44444444-4444-4444-8444-444444444444',
  'orders-impact-staff@test.local',
  '{"full_name":"Order Impact Staff"}'
);

select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'staff');

-- B fixtures (superuser bypasses lunch_days RLS)
insert into public.lunch_providers (id, name, active, primary_order_email)
values ('d1111111-1111-4111-8111-111111111111', 'Orders Impact Provider', true, 'provider-order+fixture@example.test');

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'd2111111-1111-4111-8111-111111111111',
  '2099-04-11'::date,
  '2099-04-10'::date,
  'd1111111-1111-4111-8111-111111111111',
  now() + interval '30 days',
  'open'
);

insert into public.orders (id, profile_id, lunch_day_id, status)
values
  (
    'd3111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
    'd2111111-1111-4111-8111-111111111111',
    'submitted'
  ),
  (
    'd3111111-1111-4111-8111-111111111112',
    '44444444-4444-4444-8444-444444444444',
    'd2111111-1111-4111-8111-111111111111',
    'submitted'
  );

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-06-20'::date, 'company_closure', 'global', null
  ) ->> 'requires_confirmation')::boolean,
  false,
  'Zero-impact future closure: requires_confirmation false'
);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-06-20'::date, 'company_closure', 'global', null
  ) ->> 'lunch_day_count')::integer,
  0,
  'Zero-impact future closure: lunch_day_count 0'
);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-06-20'::date, 'company_closure', 'global', null
  ) ->> 'submitted_order_count')::integer,
  0,
  'Zero-impact future closure: submitted_order_count 0'
);

select lives_ok(
  $$
    select public.upsert_manual_business_calendar_entry(
      null,
      '2099-06-20'::date,
      'company_closure',
      'global',
      null,
      'Zero impact closure',
      null,
      false
    )
  $$,
  'Zero-impact future closure saves without acknowledgement'
);

-- B. Submitted orders on operational date (orders always reference a lunch_day on that date)
reset role;

select is(
  private.business_calendar_impact_lunch_day_count('2099-04-10'::date),
  1,
  'Impact helpers: lunch_day present on closure order date'
);

select is(
  private.business_calendar_impact_submitted_order_count(
    '2099-04-10'::date,
    'global',
    null
  ),
  2,
  'Impact helpers: submitted order count on order date'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-04-10'::date, 'company_closure', 'global', null
  ) ->> 'requires_confirmation')::boolean,
  true,
  'Future closure with submitted orders requires confirmation'
);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-04-10'::date, 'company_closure', 'global', null
  ) ->> 'submitted_order_count')::integer,
  2,
  'Preview reports correct submitted_order_count'
);

select ok(
  (public.preview_business_calendar_entry_impact(
    null, '2099-04-10'::date, 'company_closure', 'global', null
  ) ->> 'summary') like '%2 submitted order(s)%',
  'Preview summary mentions submitted order count'
);

select throws_like(
  $$
    select public.upsert_manual_business_calendar_entry(
      null,
      '2099-04-10'::date,
      'company_closure',
      'global',
      null,
      'Orders impact without ack',
      null,
      false
    )
  $$,
  '%CALENDAR_IMPACT_CONFIRMATION_REQUIRED%',
  'Orders impact blocked without acknowledgement'
);

select lives_ok(
  $$
    select public.upsert_manual_business_calendar_entry(
      null,
      '2099-04-10'::date,
      'company_closure',
      'global',
      null,
      'Orders impact with ack',
      null,
      true
    )
  $$,
  'Orders impact saves with acknowledgement'
);

select is(
  (select count(*) from public.orders where lunch_day_id = 'd2111111-1111-4111-8111-111111111111'),
  2::bigint,
  'Submitted orders unchanged after closure save'
);

select is(
  (select status from public.orders where id = 'd3111111-1111-4111-8111-111111111111'),
  'submitted',
  'Order status not rewritten after closure save'
);

select * from finish();
rollback;
