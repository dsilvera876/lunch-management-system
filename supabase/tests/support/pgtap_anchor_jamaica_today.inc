-- Pin Jamaica "today" for pgTAP when unset: use wall-clock date on weekdays, else the prior business weekday.
-- Does not change production calendar rules; only affects private.jamaica_today_date() while pgtap session is active.
\ir pgtap_test_session.inc

do $$
declare
  v_wall date := (timezone('America/Jamaica', now()))::date;
  v_today date;
begin
  if nullif(current_setting('test.jamaica_today', true), '') is not null then
    return;
  end if;

  if public.iso_weekday(v_wall) is not null then
    v_today := v_wall;
  else
    select (v_wall - offs)::date
    into v_today
    from generate_series(1, 2) as offs
    where public.iso_weekday(v_wall - offs) is not null
    order by offs
    limit 1;
  end if;

  if v_today is null then
    raise exception 'Unable to anchor Jamaica pgTAP today from wall date %', v_wall;
  end if;

  perform set_config('test.jamaica_today', v_today::text, true);
end;
$$;
