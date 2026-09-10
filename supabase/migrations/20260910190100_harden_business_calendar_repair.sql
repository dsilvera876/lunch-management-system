-- Harden calendar data repair: reusable repair helper, post-repair invariant, fail on conflict.

create or replace function private.repair_provider_lunch_day_calendar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_expected date;
  v_conflict uuid;
  v_repaired integer := 0;
begin
  for v_row in
    select id, provider_id, order_date, lunch_date
    from public.lunch_days
    where provider_id is not null
      and order_date is not null
    order by order_date asc, provider_id asc
  loop
    v_expected := public.delivery_date_for_order_date(v_row.order_date);

    if v_expected is null or v_row.lunch_date = v_expected then
      continue;
    end if;

    select ld.id
    into v_conflict
    from public.lunch_days ld
    where ld.provider_id = v_row.provider_id
      and ld.lunch_date = v_expected
      and ld.id <> v_row.id
    limit 1;

    if v_conflict is not null then
      raise exception
        'Cannot repair lunch_day % (provider %, order_date %): destination lunch_date % already used by %',
        v_row.id,
        v_row.provider_id,
        v_row.order_date,
        v_expected,
        v_conflict;
    end if;

    update public.lunch_days
    set lunch_date = v_expected,
        updated_at = now()
    where id = v_row.id;

    v_repaired := v_repaired + 1;
  end loop;

  return v_repaired;
end;
$$;

create or replace function private.assert_provider_lunch_day_calendar_invariant()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invalid_count integer;
begin
  select count(*)
  into v_invalid_count
  from public.lunch_days ld
  where ld.provider_id is not null
    and ld.order_date is not null
    and ld.lunch_date <> public.delivery_date_for_order_date(ld.order_date);

  if v_invalid_count > 0 then
    raise exception
      'Provider lunch_days calendar invariant failed: % invalid row(s) remain after repair',
      v_invalid_count;
  end if;
end;
$$;

revoke all on function private.repair_provider_lunch_day_calendar() from public, anon, authenticated;
revoke all on function private.assert_provider_lunch_day_calendar_invariant() from public, anon, authenticated;

select private.repair_provider_lunch_day_calendar();
select private.assert_provider_lunch_day_calendar_invariant();
