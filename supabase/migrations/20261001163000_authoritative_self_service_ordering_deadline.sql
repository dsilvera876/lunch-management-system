-- Single authoritative self-service ordering open/deadline helpers (Jamaica-local cutoff).

create or replace function public.is_before_order_deadline(
  p_order_date date,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
strict
set search_path = ''
as $$
  select p_as_of <= public.order_deadline_for_order_date(p_order_date);
$$;

revoke all on function public.is_before_order_deadline(date, timestamptz) from public;
grant execute on function public.is_before_order_deadline(date, timestamptz) to authenticated;

create or replace function public.get_self_service_ordering_state(
  p_order_date date,
  p_office_location_id uuid default null,
  p_as_of timestamptz default now()
)
returns table (
  is_open boolean,
  order_deadline timestamptz,
  is_business_day boolean,
  period_finalized boolean
)
language sql
stable
set search_path = ''
as $$
  select
    public.is_business_day(p_order_date, p_office_location_id)
      and public.iso_weekday(p_order_date) is not null
      and not public.is_order_date_in_finalized_period(p_order_date)
      and public.is_before_order_deadline(p_order_date, p_as_of),
    public.order_deadline_for_order_date(p_order_date),
    public.is_business_day(p_order_date, p_office_location_id),
    public.is_order_date_in_finalized_period(p_order_date);
$$;

revoke all on function public.get_self_service_ordering_state(date, uuid, timestamptz) from public;
grant execute on function public.get_self_service_ordering_state(date, uuid, timestamptz) to authenticated;

-- Provider lunch days: deadline follows delivery calendar, not drifted lunch_days.order_date.
create or replace function public.effective_order_deadline(p_lunch_day_id uuid)
returns timestamptz
language sql
stable
strict
set search_path = ''
as $$
  select case
    when ld.provider_id is not null then
      public.order_deadline_for_order_date(
        coalesce(
          public.order_date_for_delivery_date(ld.lunch_date, null),
          ld.order_date
        )
      )
    else
      ld.order_deadline
  end
  from public.lunch_days ld
  where ld.id = p_lunch_day_id;
$$;

-- Align drifted snapshot metadata when reusing an existing provider delivery row.
create or replace function private.ensure_provider_lunch_day(
  p_provider_id uuid,
  p_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_date date;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
  v_created_new_row boolean := false;
begin
  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  perform private.assert_order_date_allows_ordering(p_order_date, null);

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on this date';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where provider_id = p_provider_id
    and order_date = p_order_date;

  if found then
    if p_order_date = private.jamaica_today_date()
       and not exists (
         select 1
         from public.menu_items mi
         where mi.lunch_day_id = v_lunch_day_id
       )
    then
      insert into public.menu_items (
        lunch_day_id,
        provider_menu_item_id,
        name,
        description,
        price,
        item_type,
        unit_label,
        display_category,
        is_active
      )
      select
        v_lunch_day_id,
        pmi.id,
        pmi.name,
        pmi.description,
        pmi.price,
        pmi.item_type,
        pmi.unit_label,
        pmi.display_category,
        true
      from public.provider_menu_items pmi
      join public.provider_menu_item_weekdays pmw
        on pmw.provider_menu_item_id = pmi.id
      where pmi.provider_id = p_provider_id
        and pmi.active = true
        and pmw.weekday = v_order_weekday;
    end if;

    return v_lunch_day_id;
  end if;

  v_delivery_date := public.delivery_date_for_order_date(p_order_date);

  if v_delivery_date is null then
    raise exception 'Unable to determine delivery date';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where provider_id = p_provider_id
    and lunch_date = v_delivery_date;

  if found then
    v_deadline := public.order_deadline_for_order_date(p_order_date);

    update public.lunch_days
    set
      order_date = p_order_date,
      order_deadline = v_deadline,
      updated_at = now()
    where id = v_lunch_day_id
      and (
        order_date is distinct from p_order_date
        or order_deadline is distinct from v_deadline
      );

    return v_lunch_day_id;
  end if;

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  insert into public.lunch_days (
    lunch_date,
    order_date,
    provider_id,
    order_deadline,
    status
  )
  values (
    v_delivery_date,
    p_order_date,
    p_provider_id,
    v_deadline,
    'open'
  )
  on conflict (lunch_date, provider_id) where provider_id is not null
  do nothing
  returning id into v_lunch_day_id;

  if v_lunch_day_id is null then
    select id
    into v_lunch_day_id
    from public.lunch_days
    where provider_id = p_provider_id
      and lunch_date = v_delivery_date;
  else
    v_created_new_row := true;
  end if;

  if v_lunch_day_id is null then
    raise exception 'Unable to resolve provider lunch day';
  end if;

  if v_created_new_row
     or (
       p_order_date = private.jamaica_today_date()
       and not exists (
         select 1
         from public.menu_items mi
         where mi.lunch_day_id = v_lunch_day_id
       )
     )
  then
    insert into public.menu_items (
      lunch_day_id,
      provider_menu_item_id,
      name,
      description,
      price,
      item_type,
      unit_label,
      display_category,
      is_active
    )
    select
      v_lunch_day_id,
      pmi.id,
      pmi.name,
      pmi.description,
      pmi.price,
      pmi.item_type,
      pmi.unit_label,
      pmi.display_category,
      true
    from public.provider_menu_items pmi
    join public.provider_menu_item_weekdays pmw
      on pmw.provider_menu_item_id = pmi.id
    where pmi.provider_id = p_provider_id
      and pmi.active = true
      and pmw.weekday = v_order_weekday;
  end if;

  return v_lunch_day_id;
end;
$$;

revoke execute on function private.ensure_provider_lunch_day(uuid, date)
from public, anon, authenticated;

create or replace function private.insert_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text,
  p_office_location_id uuid,
  p_order_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

  v_meal_quantity := private.validate_provider_order_payload(
    p_provider_id,
    p_items
  );

  v_items := private.build_provider_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  perform private.assert_order_date_allows_ordering(p_order_date, v_location_id);

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on this date';
  end if;

  v_special_instructions :=
    private.normalize_special_instructions(p_special_instructions);

  if p_special_instructions is not null
     and length(trim(p_special_instructions)) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
  end if;

  perform private.validate_order_date_not_in_finalized_period(p_order_date);

  if not public.is_before_order_deadline(p_order_date, now()) then
    raise exception 'The ordering deadline has passed';
  end if;

  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  v_lunch_day_id := private.ensure_provider_lunch_day(
    p_provider_id,
    p_order_date
  );

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_provider_menu_item_id :=
        (v_item ->> 'provider_menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id
      and mi.is_active = true;

    if not found then
      raise exception
        'Menu item % for provider % is invalid or inactive on lunch day %',
        v_provider_menu_item_id,
        p_provider_id,
        v_lunch_day_id;
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    special_instructions,
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address,
    order_group_id
  )
  values (
    v_actor,
    v_lunch_day_id,
    v_special_instructions,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address,
    p_order_group_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    v_provider_menu_item_id :=
      (v_item ->> 'provider_menu_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id;

    insert into public.order_items (
      order_id,
      menu_item_id,
      quantity
    )
    values (
      v_order_id,
      v_menu_item_id,
      v_quantity
    );
  end loop;

  perform private.safe_notify_staff_order_event('staff.order_submitted', v_order_id);

  return v_order_id;
end;
$$;

create or replace function private.today_menu_recipient_eligible(
  p_profile_id uuid,
  p_order_date date,
  p_as_of timestamptz default now()
)
returns table (
  eligible boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_email text;
  v_location_id uuid;
  v_state record;
begin
  if not private.notification_globally_enabled('staff.today_menu') then
    return query select false, 'globally_disabled';
    return;
  end if;

  select *
  into v_profile
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    return query select false, 'profile_not_found';
    return;
  end if;

  if v_profile.account_status <> 'active' then
    return query select false, 'account_inactive';
    return;
  end if;

  if not private.is_active_lunch_ordering_profile(p_profile_id) then
    return query select false, 'not_lunch_participant';
    return;
  end if;

  select u.email
  into v_email
  from auth.users u
  where u.id = p_profile_id;

  if v_email is null or btrim(v_email) = '' or position('@' in v_email) = 0 then
    return query select false, 'no_email';
    return;
  end if;

  v_location_id := v_profile.default_office_location_id;

  select *
  into v_state
  from public.get_self_service_ordering_state(
    p_order_date,
    v_location_id,
    p_as_of
  );

  if not v_state.is_business_day then
    return query select false, 'business_day_closed';
    return;
  end if;

  if v_state.period_finalized then
    return query select false, 'period_finalized';
    return;
  end if;

  if not public.is_before_order_deadline(p_order_date, p_as_of) then
    return query select false, 'ordering_closed';
    return;
  end if;

  if not private.order_date_has_staff_menu(p_order_date) then
    return query select false, 'no_applicable_menu';
    return;
  end if;

  if not private.effective_staff_notification_preference(p_profile_id, 'staff.today_menu') then
    return query select false, 'preference_disabled';
    return;
  end if;

  return query select true, null::text;
end;
$$;
