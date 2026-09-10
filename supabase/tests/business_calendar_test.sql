begin;

select plan(17);

-- Forward mapping: week of 2026-09-07 (Mon–Fri)
select results_eq(
  $$ select public.delivery_date_for_order_date('2026-09-07'::date)::text $$,
  array['2026-09-08'::text],
  'Monday order date maps to Tuesday delivery'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-09-08'::date)::text $$,
  array['2026-09-09'::text],
  'Tuesday order date maps to Wednesday delivery'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-09-09'::date)::text $$,
  array['2026-09-10'::text],
  'Wednesday order date maps to Thursday delivery'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-09-10'::date)::text $$,
  array['2026-09-11'::text],
  'Thursday order date maps to Friday delivery'
);

select results_eq(
  $$ select public.delivery_date_for_order_date('2026-09-11'::date)::text $$,
  array['2026-09-14'::text],
  'Friday order date maps to Monday delivery'
);

select is(
  public.delivery_date_for_order_date('2026-09-12'::date),
  null,
  'Saturday order date returns NULL'
);

select is(
  public.delivery_date_for_order_date('2026-09-13'::date),
  null,
  'Sunday order date returns NULL'
);

-- Inverse mapping
select results_eq(
  $$ select public.order_date_for_delivery_date('2026-09-08'::date)::text $$,
  array['2026-09-07'::text],
  'Tuesday delivery maps to Monday order date'
);

select results_eq(
  $$ select public.order_date_for_delivery_date('2026-09-09'::date)::text $$,
  array['2026-09-08'::text],
  'Wednesday delivery maps to Tuesday order date'
);

select results_eq(
  $$ select public.order_date_for_delivery_date('2026-09-10'::date)::text $$,
  array['2026-09-09'::text],
  'Thursday delivery maps to Wednesday order date'
);

select results_eq(
  $$ select public.order_date_for_delivery_date('2026-09-11'::date)::text $$,
  array['2026-09-10'::text],
  'Friday delivery maps to Thursday order date'
);

select results_eq(
  $$ select public.order_date_for_delivery_date('2026-09-14'::date)::text $$,
  array['2026-09-11'::text],
  'Monday delivery maps to previous Friday order date'
);

select is(
  public.order_date_for_delivery_date('2026-09-12'::date),
  null,
  'Saturday delivery returns NULL'
);

select is(
  public.order_date_for_delivery_date('2026-09-13'::date),
  null,
  'Sunday delivery returns NULL'
);

-- Round-trip for every weekday delivery date in the sample week
select bag_eq(
  $$
    select public.delivery_date_for_order_date(public.order_date_for_delivery_date(d))::text
    from (
      values
        ('2026-09-08'::date),
        ('2026-09-09'::date),
        ('2026-09-10'::date),
        ('2026-09-11'::date),
        ('2026-09-14'::date)
    ) as v(d)
  $$,
  $$
    values
      ('2026-09-08'::text),
      ('2026-09-09'::text),
      ('2026-09-10'::text),
      ('2026-09-11'::text),
      ('2026-09-14'::text)
  $$,
  'Forward helper inverts inverse helper for all weekday deliveries'
);

select bag_eq(
  $$
    select public.order_date_for_delivery_date(public.delivery_date_for_order_date(d))::text
    from (
      values
        ('2026-09-07'::date),
        ('2026-09-08'::date),
        ('2026-09-09'::date),
        ('2026-09-10'::date),
        ('2026-09-11'::date)
    ) as v(d)
  $$,
  $$
    values
      ('2026-09-07'::text),
      ('2026-09-08'::text),
      ('2026-09-09'::text),
      ('2026-09-10'::text),
      ('2026-09-11'::text)
  $$,
  'Inverse helper inverts forward helper for all weekday order dates'
);

-- Regression: Thursday must not jump to Monday
select isnt(
  public.delivery_date_for_order_date('2026-09-10'::date),
  '2026-09-14'::date,
  'Thursday order date must not map to the following Monday'
);

select * from finish();
rollback;
