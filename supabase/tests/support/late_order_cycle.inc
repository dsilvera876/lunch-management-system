-- Deterministic late-order cycle for pgTAP (Jamaica calendar, relative to jamaica_today_date()).
-- Safe within BEGIN/ROLLBACK test transactions only.
--
-- Picks order/delivery dates that keep HR late-order RPCs in-window across wall-clock time:
-- 1) Prefer a prior order date whose delivery is strictly after today.
-- 2) Else prior order date delivering today while provider deadline has not passed.
-- 3) Else same-day order with future delivery after company cutoff has passed.

set time zone 'America/Jamaica';

do $$
declare
  v_today date := private.jamaica_today_date();
  v_current_order_date date;
  v_order_date date;
  v_delivery_date date;
  v_past_order_date date;
  v_provider_id uuid;
begin
  select p.id
  into v_provider_id
  from public.lunch_providers p
  where p.accepts_late_orders is true
  order by p.id
  limit 1;

  if v_provider_id is null then
    v_provider_id := 'b1111111-1111-4111-8111-111111111111';
  end if;
  if public.iso_weekday(v_today) is not null then
    v_current_order_date := v_today;
  else
    select (v_today - offs)
    into v_current_order_date
    from generate_series(1, 3) as offs
    where public.iso_weekday((v_today - offs)) is not null
    order by offs
    limit 1;
  end if;

  if v_current_order_date is null then
    raise exception 'Unable to resolve current order date for %', v_today;
  end if;
  select candidate.order_date, candidate.delivery_date
  into v_order_date, v_delivery_date
  from (
    select
      (v_today - offs) as order_date,
      public.delivery_date_for_order_date((v_today - offs)) as delivery_date
    from generate_series(1, 21) as offs
  ) candidate
  where public.iso_weekday(candidate.order_date) is not null
    and candidate.delivery_date is not null
    and candidate.order_date < v_today
    and candidate.delivery_date > v_today
  order by candidate.order_date desc
  limit 1;

  if v_order_date is null then
    select candidate.order_date, candidate.delivery_date
    into v_order_date, v_delivery_date
    from (
      select
        (v_today - offs) as order_date,
        public.delivery_date_for_order_date((v_today - offs)) as delivery_date
      from generate_series(1, 21) as offs
    ) candidate
    where public.iso_weekday(candidate.order_date) is not null
      and candidate.delivery_date is not null
      and candidate.order_date < v_today
      and candidate.delivery_date = v_today
      and now() <= public.provider_late_order_deadline_at(
        v_provider_id,
        candidate.order_date,
        candidate.delivery_date
      )
    order by candidate.order_date desc
    limit 1;
  end if;

  if v_order_date is null then
    select candidate.order_date, candidate.delivery_date
    into v_order_date, v_delivery_date
    from (
      select
        (v_today - offs) as order_date,
        public.delivery_date_for_order_date((v_today - offs)) as delivery_date
      from generate_series(0, 21) as offs
    ) candidate
    where public.iso_weekday(candidate.order_date) is not null
      and candidate.delivery_date is not null
      and candidate.delivery_date > v_today
      and candidate.order_date <= v_today
      and now() > public.order_deadline_for_order_date(candidate.order_date)
    order by candidate.order_date desc
    limit 1;
  end if;

  -- Monday edge case: no prior weekday has delivery strictly after today; use prior
  -- weekday delivering today (e.g. Friday -> Monday) without requiring provider setup.
  if v_order_date is null then
    select candidate.order_date, candidate.delivery_date
    into v_order_date, v_delivery_date
    from (
      select
        (v_today - offs) as order_date,
        public.delivery_date_for_order_date((v_today - offs)) as delivery_date
      from generate_series(1, 21) as offs
    ) candidate
    where public.iso_weekday(candidate.order_date) is not null
      and candidate.delivery_date is not null
      and candidate.order_date < v_today
      and candidate.delivery_date = v_today
    order by candidate.order_date desc
    limit 1;
  end if;

  if v_order_date is null or v_delivery_date is null then
    raise exception 'Unable to resolve deterministic late-order cycle for %', v_today;
  end if;

  select candidate.order_date
  into v_past_order_date
  from (
    select (v_today - offs) as order_date
    from generate_series(1, 21) as offs
  ) candidate
  where public.iso_weekday(candidate.order_date) is not null
    and candidate.order_date < v_order_date
  order by candidate.order_date desc
  limit 1;

  perform set_config('test.jamaica_today', v_today::text, false);
  perform set_config('test.current_order_date', v_current_order_date::text, false);
  perform set_config('test.late_order_date', v_order_date::text, false);
  perform set_config('test.late_delivery_date', v_delivery_date::text, false);
  perform set_config(
    'test.past_order_date',
    coalesce(v_past_order_date::text, (v_order_date - 7)::text),
    false
  );
end;
$$;
