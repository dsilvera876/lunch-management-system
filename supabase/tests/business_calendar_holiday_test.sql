begin;

select plan(30);

-- Fixture week: 2099-01-05 Mon … 2099-01-11 Sun

select is(public.is_business_day('2099-01-05'::date, null), true, 'Monday open');
select is(public.is_business_day('2099-01-10'::date, null), false, 'Saturday closed');
select is(public.is_business_day('2099-01-11'::date, null), false, 'Sunday closed');

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-01-06'::date, 'public_holiday', 'global', 'Fixture Holiday', 'manual');

select is(public.is_business_day('2099-01-06'::date, null), false, 'Public holiday closed');

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-01-07'::date, 'company_closure', 'global', 'Fixture Closure', 'manual');

select is(public.is_business_day('2099-01-07'::date, null), false, 'Company closure closed');

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-01-10'::date, 'override_open', 'global', 'Weekend open', 'manual');

select is(public.is_business_day('2099-01-10'::date, null), true, 'Override_open beats weekend');

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-01-08'::date, 'override_closed', 'global', 'Force close', 'manual');

select is(public.is_business_day('2099-01-08'::date, null), false, 'Override_closed on weekday');

insert into public.office_locations (id, name, address, is_active)
values
  ('a1111111-1111-4111-8111-111111111111', 'Fixture Site A', '1 Test Road', true),
  ('a2222222-2222-4222-8222-222222222222', 'Fixture Site B', '2 Test Road', true);

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  '2099-01-09'::date, 'company_closure', 'location',
  'a1111111-1111-4111-8111-111111111111', 'Site A closure', 'manual'
);

select is(
  public.is_business_day('2099-01-09'::date, 'a1111111-1111-4111-8111-111111111111'),
  false,
  'Location closure affects matching location'
);

select is(
  public.is_business_day('2099-01-09'::date, 'a2222222-2222-4222-8222-222222222222'),
  true,
  'Location closure does not affect other locations'
);

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-01-14'::date, 'public_holiday', 'global', 'Global holiday Monday', 'manual');

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  '2099-01-14'::date, 'override_open', 'location',
  'a1111111-1111-4111-8111-111111111111', 'Site A open on holiday', 'manual'
);

select is(
  public.is_business_day('2099-01-14'::date, 'a1111111-1111-4111-8111-111111111111'),
  true,
  'Location override_open beats global holiday for that location'
);

select is(
  public.is_business_day('2099-01-14'::date, null),
  false,
  'Global holiday remains closed without location override'
);

select results_eq(
  $$ select public.next_business_day('2099-01-04'::date, null)::text $$,
  array['2099-01-05'::text],
  'next_business_day from Sunday'
);

select results_eq(
  $$ select public.next_business_day('2099-01-05'::date, null)::text $$,
  array['2099-01-09'::text],
  'next_business_day skips holiday, closure, and override_closed'
);

select results_eq(
  $$ select public.previous_business_day('2099-01-09'::date, null)::text $$,
  array['2099-01-05'::text],
  'previous_business_day skips blocked days'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2099-01-05'::date)::text $$,
  array['2099-01-09'::text],
  'delivery_date_for_order_date skips blocked days'
);

select is(public.delivery_date_for_order_date('2099-01-06'::date), null, 'Closed order date -> NULL delivery');
select is(public.order_date_for_delivery_date('2099-01-11'::date), null, 'Closed delivery date (Sunday) -> NULL order');

select results_eq(
  $$
    select public.delivery_date_for_order_date(
      public.order_date_for_delivery_date('2099-01-09'::date)
    )::text
  $$,
  array['2099-01-09'::text],
  'Round-trip for open delivery date'
);

update private.business_calendar_entries
set archived_at = now()
where calendar_date = '2099-01-10'::date and entry_type = 'override_open';

select is(public.is_business_day('2099-01-10'::date, null), false, 'Archived entry ignored');

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('22222222-2222-4222-8222-222222222222', 'hr-cal@test.local', '{"full_name":"HR Cal"}'),
  ('44444444-4444-4444-8444-444444444444', 'admin-cal@test.local', '{"full_name":"Admin Cal"}');

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('44444444-4444-4444-8444-444444444444', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select throws_ok(
  $$
    select public.upsert_manual_business_calendar_entry(
      null, '2099-12-01'::date, 'company_closure', 'global', null, 'Denied', null, false
    )
  $$,
  null,
  'Admin cannot mutate calendar without HR role'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$
    select public.upsert_manual_business_calendar_entry(
      null, '2099-12-02'::date, 'company_closure', 'global', null, 'HR closure', null, true
    )
  $$,
  'HR can create manual entry'
);

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.start_support_session('hr', 'calendar read test');

select lives_ok(
  $$ select count(*) from public.list_business_calendar_entries(2099) $$,
  'HR support can list entries'
);

select throws_ok(
  $$
    select public.archive_business_calendar_entry(
      (select id from private.business_calendar_entries where name = 'HR closure' limit 1)
    )
  $$,
  null,
  'HR support read-only cannot archive'
);

select is(
  (
    select closure_entry_type
    from public.get_business_day_ordering_closure('2099-01-07'::date, null)
  ),
  'company_closure',
  'Ordering closure RPC returns company_closure entry type'
);

select is(
  (
    select closure_name
    from public.get_business_day_ordering_closure('2099-01-07'::date, null)
  ),
  'Fixture Closure',
  'Ordering closure RPC returns company closure name'
);

select is(
  (
    select closure_entry_type
    from public.get_business_day_ordering_closure('2099-01-06'::date, null)
  ),
  'public_holiday',
  'Ordering closure RPC returns public_holiday entry type'
);

select is(
  (
    select closure_name
    from public.get_business_day_ordering_closure('2099-01-09'::date, 'a1111111-1111-4111-8111-111111111111')
  ),
  'Site A closure',
  'Location-scoped closure wins for matching office location'
);

select is(
  (
    select is_business_day
    from public.get_business_day_ordering_closure('2099-01-14'::date, 'a1111111-1111-4111-8111-111111111111')
  ),
  true,
  'Location override_open yields open business day for ordering closure RPC'
);

select is(
  (
    select closure_name
    from public.get_business_day_ordering_closure('2099-01-11'::date, null)
  ),
  null,
  'Weekend closure without named entry returns null closure name'
);

select is(
  (
    select closure_entry_type
    from public.get_business_day_ordering_closure('2099-01-08'::date, null)
  ),
  'override_closed',
  'Override closed entry type is exposed for staff copy formatting'
);

select * from finish();
rollback;
