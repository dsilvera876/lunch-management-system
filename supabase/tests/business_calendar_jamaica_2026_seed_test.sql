begin;

select plan(25);

reset role;

select is(
  (select count(*)::integer
   from private.business_calendar_entries
   where source = 'official'
     and entry_type = 'public_holiday'
     and scope = 'global'
     and archived_at is null
     and calendar_date >= '2026-01-01'::date
     and calendar_date <= '2026-12-31'::date),
  10,
  '2026 official seed provides ten public holidays'
);

select is(
  (select count(*)::integer
   from private.business_calendar_entries
   where source = 'official'
     and calendar_date = '2026-05-23'::date),
  0,
  'Labour Day 2026-05-23 is not seeded as a public holiday'
);

select is(
  (select name from private.business_calendar_entries
   where source = 'official' and calendar_date = '2026-05-25'::date),
  'National Labour Day',
  'Labour Day observed on 2026-05-25'
);

-- Idempotency (HR caller)
\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values ('55555555-5555-4555-8555-555555555555', 'hr-seed@test.local', '{"full_name":"HR Seed"}');

select private.apply_profile_role('55555555-5555-4555-8555-555555555555', 'hr');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

select is(
  public.seed_official_business_calendar_year(2026),
  0,
  'Second 2026 seed call inserts zero rows'
);

select is(
  public.seed_official_business_calendar_year(2027),
  0,
  'Unsupported year returns zero without inventing rows'
);

reset role;

select is(
  (select count(*)::integer
   from private.business_calendar_entries
   where source = 'official'
     and calendar_date = '2026-05-25'::date
     and archived_at is null),
  1,
  'No duplicate official Labour Day rows after re-seed'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

-- Manual override survives alongside official closure
select lives_ok(
  $$
    select public.upsert_manual_business_calendar_entry(
      null,
      '2026-05-25'::date,
      'override_open',
      'global',
      null,
      'Manual open on Labour Day',
      null,
      false
    )
  $$,
  'Manual override_open can be added on official Labour Day date'
);

select is(
  public.is_business_day('2026-05-25'::date, null),
  true,
  'Manual override_open + official Labour Day -> OPEN'
);

reset role;

select is(
  (select count(*)::integer
   from private.business_calendar_entries
   where calendar_date = '2026-05-25'::date
     and archived_at is null
     and source = 'official'),
  1,
  'Official Labour Day row retained when override exists'
);

-- Labour Day week operational behavior
select is(
  public.is_business_day('2026-05-22'::date, null),
  true,
  'Friday 2026-05-22 is open before Labour Day'
);

delete from private.business_calendar_entries
where calendar_date = '2026-05-25'::date
  and entry_type = 'override_open'
  and source = 'manual';

select is(
  public.is_business_day('2026-05-25'::date, null),
  false,
  'Monday 2026-05-25 closed after removing override'
);

select results_eq(
  $$ select public.next_business_day('2026-05-22'::date, null)::text $$,
  array['2026-05-26'::text],
  'next_business_day from Friday 2026-05-22 skips Labour Day to Tuesday'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-05-22'::date, null)::text $$,
  array['2026-05-26'::text],
  'delivery_date_for_order_date on 2026-05-22 lands on 2026-05-26'
);

-- Emancipation Day (Saturday, not moved)
select is(
  public.is_business_day('2026-08-01'::date, null),
  false,
  'Saturday 2026-08-01 Emancipation Day is not a business day'
);

select is(
  public.is_business_day('2026-08-03'::date, null),
  true,
  'Monday 2026-08-03 remains an ordinary business day'
);

-- Independence Day
select is(
  public.is_business_day('2026-08-06'::date, null),
  false,
  'Independence Day 2026-08-06 closed'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-08-05'::date, null)::text $$,
  array['2026-08-07'::text],
  'Wednesday 2026-08-05 order delivery skips Independence Day to Friday'
);

-- National Heroes' Day
select is(
  public.is_business_day('2026-10-19'::date, null),
  false,
  'National Heroes Day 2026-10-19 closed'
);

select results_eq(
  $$ select public.next_business_day('2026-10-16'::date, null)::text $$,
  array['2026-10-20'::text],
  'next_business_day after Friday before Heroes Day skips Monday holiday'
);

-- Christmas / Boxing Day 2026 (Fri/Sat; no Monday substitution seeded)
select is(
  public.is_business_day('2026-12-25'::date, null),
  false,
  'Christmas Day 2026-12-25 closed'
);

select is(
  public.is_business_day('2026-12-26'::date, null),
  false,
  'Boxing Day 2026-12-26 closed (Saturday observance)'
);

select is(
  public.is_business_day('2026-12-28'::date, null),
  true,
  'Monday 2026-12-28 open after Christmas weekend holidays'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-12-24'::date, null)::text $$,
  array['2026-12-28'::text],
  'Christmas week order date skips Fri/Sat holidays to Monday 2026-12-28'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

-- Official row protection
select throws_like(
  $$
    select public.archive_business_calendar_entry(
      (select id
       from public.list_business_calendar_entries(2026, null, null)
       where calendar_date = '2026-01-01'::date
         and source = 'official'
       limit 1)
    )
  $$,
  '%Official holidays cannot be archived%',
  'HR cannot archive official holiday rows'
);

select throws_like(
  $$
    select public.upsert_manual_business_calendar_entry(
      (select id
       from public.list_business_calendar_entries(2026, null, null)
       where calendar_date = '2026-01-01'::date
         and source = 'official'
       limit 1),
      '2026-01-01'::date,
      'public_holiday',
      'global',
      null,
      'Renamed',
      null,
      false
    )
  $$,
  '%Official holidays cannot be edited%',
  'HR cannot edit official holiday rows'
);

select * from finish();
rollback;
