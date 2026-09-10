begin;

select plan(7);

insert into public.lunch_providers (id, name, active)
values (
  'f1111111-1111-4111-8111-111111111111',
  'Calendar Repair Provider',
  true
);

-- Simple invalid row: Tue order 2026-09-08 stored on wrong delivery 2026-09-10.
insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'f2111111-1111-4111-8111-111111111111',
  '2026-09-10'::date,
  '2026-09-08'::date,
  'f1111111-1111-4111-8111-111111111111',
  timestamptz '2026-09-08 21:00:00-05',
  'open'
);

select is(
  private.repair_provider_lunch_day_calendar(),
  1,
  'Simple invalid provider lunch_day is repaired'
);

select results_eq(
  $$
    select lunch_date::text
    from public.lunch_days
    where id = 'f2111111-1111-4111-8111-111111111111'
  $$,
  array['2026-09-09'::text],
  'Simple repair moves lunch_date to the corrected delivery date'
);

select lives_ok(
  $$ select private.assert_provider_lunch_day_calendar_invariant() $$,
  'Invariant passes after successful repair'
);

delete from public.lunch_days
where provider_id = 'f1111111-1111-4111-8111-111111111111';

-- Chain repair: earlier row must vacate lunch_date before later row can land.
insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values
(
  'f3111111-1111-4111-8111-111111111111',
  '2026-09-10'::date,
  '2026-09-08'::date,
  'f1111111-1111-4111-8111-111111111111',
  timestamptz '2026-09-08 21:00:00-05',
  'open'
),
(
  'f3222222-2222-4222-8222-222222222222',
  '2026-09-12'::date,
  '2026-09-09'::date,
  'f1111111-1111-4111-8111-111111111111',
  timestamptz '2026-09-09 21:00:00-05',
  'open'
);

select is(
  private.repair_provider_lunch_day_calendar(),
  2,
  'Chain of invalid rows repairs in order_date order'
);

select bag_eq(
  $$
    select lunch_date::text
    from public.lunch_days
    where id in (
      'f3111111-1111-4111-8111-111111111111',
      'f3222222-2222-4222-8222-222222222222'
    )
  $$,
  $$
    values
      ('2026-09-09'::text),
      ('2026-09-10'::text)
  $$,
  'Chain repair lands each cycle on the corrected delivery date'
);

delete from public.lunch_days
where provider_id = 'f1111111-1111-4111-8111-111111111111';

-- True destination conflict: two cycles share order_date; first repair claims the slot.
insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values
(
  'f4111111-1111-4111-8111-111111111111',
  '2026-09-09'::date,
  '2026-09-08'::date,
  'f1111111-1111-4111-8111-111111111111',
  timestamptz '2026-09-08 21:00:00-05',
  'open'
),
(
  'f4222222-2222-4222-8222-222222222222',
  '2026-09-10'::date,
  '2026-09-08'::date,
  'f1111111-1111-4111-8111-111111111111',
  timestamptz '2026-09-08 21:00:00-05',
  'open'
);

select throws_like(
  $$ select private.repair_provider_lunch_day_calendar() $$,
  'Cannot repair lunch_day%',
  'True destination conflict aborts repair instead of merging cycles'
);

delete from public.lunch_days
where provider_id = 'f1111111-1111-4111-8111-111111111111';

-- Unresolved invalid row is detected by the invariant (no silent success).
insert into public.lunch_days (
  id,
  lunch_date,
  order_date,
  provider_id,
  order_deadline,
  status
)
values (
  'f5111111-1111-4111-8111-111111111111',
  '2026-09-14'::date,
  '2026-09-10'::date,
  'f1111111-1111-4111-8111-111111111111',
  timestamptz '2026-09-10 21:00:00-05',
  'open'
);

select throws_ok(
  $$ select private.assert_provider_lunch_day_calendar_invariant() $$,
  'Provider lunch_days calendar invariant failed: 1 invalid row(s) remain after repair',
  'Invariant rejects unresolved invalid provider cycles'
);

select * from finish();
rollback;
