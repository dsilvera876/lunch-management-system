begin;

select plan(13);

-- Coexistence: closure + override on same global date
insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-03-03'::date, 'public_holiday', 'global', 'Global holiday', 'manual');

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-03-03'::date, 'override_open', 'global', 'Global open override', 'manual');

select is(
  public.is_business_day('2099-03-03'::date, null),
  true,
  'Global holiday + global override_open -> OPEN'
);

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-03-04'::date, 'company_closure', 'global', 'Global closure', 'manual');

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-03-04'::date, 'override_closed', 'global', 'Global force close', 'manual');

select is(
  public.is_business_day('2099-03-04'::date, null),
  false,
  'Global closure + global override_closed -> CLOSED'
);

insert into public.office_locations (id, name, address, is_active)
values ('b1111111-1111-4111-8111-111111111111', 'Coexist Site', '1 Coexist Rd', true);

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  '2099-03-05'::date, 'company_closure', 'location',
  'b1111111-1111-4111-8111-111111111111', 'Location closure', 'manual'
);

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  '2099-03-05'::date, 'override_open', 'location',
  'b1111111-1111-4111-8111-111111111111', 'Location open', 'manual'
);

select is(
  public.is_business_day('2099-03-05'::date, 'b1111111-1111-4111-8111-111111111111'),
  true,
  'Location closure + location override_open -> OPEN at location'
);

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-03-06'::date, 'public_holiday', 'global', 'Holiday', 'manual');

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  '2099-03-06'::date, 'override_open', 'location',
  'b1111111-1111-4111-8111-111111111111', 'Site open', 'manual'
);

select is(
  public.is_business_day('2099-03-06'::date, 'b1111111-1111-4111-8111-111111111111'),
  true,
  'Global holiday + location override_open -> matching location OPEN'
);

select is(
  public.is_business_day('2099-03-06'::date, null),
  false,
  'Global holiday + location override_open -> global remains CLOSED'
);

insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
values ('2099-03-07'::date, 'override_open', 'global', 'Global open', 'manual');

insert into private.business_calendar_entries (
  calendar_date, entry_type, scope, office_location_id, name, source
)
values (
  '2099-03-07'::date, 'override_closed', 'location',
  'b1111111-1111-4111-8111-111111111111', 'Site closed', 'manual'
);

select is(
  public.is_business_day('2099-03-07'::date, 'b1111111-1111-4111-8111-111111111111'),
  false,
  'Global override_open + location override_closed -> location CLOSED'
);

select throws_ok(
  $$
    insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
    values ('2099-03-03'::date, 'override_closed', 'global', 'Duplicate override', 'manual')
  $$,
  '23505',
  null,
  'Duplicate active global override rejected'
);

select throws_ok(
  $$
    insert into private.business_calendar_entries (calendar_date, entry_type, scope, name, source)
    values ('2099-03-03'::date, 'company_closure', 'global', 'Duplicate closure', 'manual')
  $$,
  '23505',
  null,
  'Duplicate active global closure rejected'
);

-- Impact preview + acknowledgement
insert into public.lunch_providers (id, name, active)
values ('c1111111-1111-4111-8111-111111111111', 'Impact Provider', true);

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'c2111111-1111-4111-8111-111111111111',
  '2099-04-02'::date,
  '2099-04-01'::date,
  'c1111111-1111-4111-8111-111111111111',
  now() + interval '7 days',
  'open'
);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-4222-8222-222222222222', 'hr-impact@test.local', '{"full_name":"HR Impact"}');

select private.apply_profile_role('22222222-2222-4222-8222-222222222222', 'hr');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-04-01'::date, 'company_closure', 'global', null
  ) ->> 'requires_confirmation')::boolean,
  true,
  'Future closure with lunch_day requires confirmation'
);

select throws_like(
  $$
    select public.upsert_manual_business_calendar_entry(
      null,
      '2099-04-01'::date,
      'company_closure',
      'global',
      null,
      'Closure without ack',
      null,
      false
    )
  $$,
  '%CALENDAR_IMPACT_CONFIRMATION_REQUIRED%',
  'Closure save blocked without acknowledgement'
);

select lives_ok(
  $$
    select public.upsert_manual_business_calendar_entry(
      null,
      '2099-04-01'::date,
      'company_closure',
      'global',
      null,
      'Closure with ack',
      null,
      true
    )
  $$,
  'Closure save allowed after acknowledgement'
);

select is(
  (select count(*) from public.lunch_days where id = 'c2111111-1111-4111-8111-111111111111'),
  1::bigint,
  'Existing lunch_day unchanged after calendar closure save'
);

select is(
  (public.preview_business_calendar_entry_impact(
    null, '2099-05-01'::date, 'override_open', 'global', null
  ) ->> 'requires_confirmation')::boolean,
  false,
  'Override open does not require destructive confirmation'
);

select * from finish();
rollback;
