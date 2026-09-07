-- ============================================================
-- Block new orders when the order date belongs to a finalized
-- lunch period (financial immutability).
-- ============================================================

create or replace function private.is_order_date_in_finalized_period(
  p_order_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lunch_periods lp
    where p_order_date between lp.start_date and lp.end_date
      and lp.status = 'finalized'
  );
$$;

revoke all on function private.is_order_date_in_finalized_period(date) from public;

create or replace function public.is_order_date_in_finalized_period(
  p_order_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_order_date_in_finalized_period(p_order_date);
$$;

revoke execute on function public.is_order_date_in_finalized_period(date) from public, anon;
grant execute on function public.is_order_date_in_finalized_period(date) to authenticated;

create or replace function private.validate_order_date_not_in_finalized_period(
  p_order_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_order_date is null then
    return;
  end if;

  if (select private.is_order_date_in_finalized_period(p_order_date)) then
    raise exception 'Ordering is unavailable because this lunch period has been finalized';
  end if;
end;
$$;

revoke all on function private.validate_order_date_not_in_finalized_period(date) from public;


-- ------------------------------------------------------------
-- Provider order submission
-- ------------------------------------------------------------

create or replace function public.submit_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_weekday smallint;
  v_lunch_day_id uuid;
  v_deadline timestamptz;
  v_order_id uuid;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  perform private.validate_order_date_not_in_finalized_period(p_order_date);

  v_deadline := public.order_deadline_for_order_date(p_order_date);

  if now() > v_deadline then
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
    from jsonb_array_elements(p_items)
  loop
    begin
      v_provider_menu_item_id :=
        (v_item ->> 'provider_menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    if not exists (
      select 1
      from public.provider_menu_items pmi
      where pmi.id = v_provider_menu_item_id
        and pmi.provider_id = p_provider_id
        and pmi.active = true
    ) then
      raise exception 'Menu item is invalid or inactive';
    end if;

    select mi.id
    into v_menu_item_id
    from public.menu_items mi
    where mi.lunch_day_id = v_lunch_day_id
      and mi.provider_menu_item_id = v_provider_menu_item_id
      and mi.is_active = true;

    if not found then
      raise exception 'Menu item is invalid or inactive';
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id
  )
  values (
    (select auth.uid()),
    v_lunch_day_id
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
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

  return v_order_id;
end;
$$;

revoke execute on function public.submit_provider_order(uuid, date, jsonb) from public, anon;
grant execute on function public.submit_provider_order(uuid, date, jsonb) to authenticated;


-- ------------------------------------------------------------
-- Insert trigger guard (submit_order + direct inserts)
-- ------------------------------------------------------------

create or replace function private.validate_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_deadline timestamptz;
  v_order_date date;
begin
  select
    ld.status,
    public.effective_order_deadline(ld.id),
    coalesce(ld.order_date, ld.lunch_date)
  into v_status, v_deadline, v_order_date
  from public.lunch_days ld
  where ld.id = new.lunch_day_id;

  if not found then
    raise exception 'Lunch day does not exist';
  end if;

  perform private.validate_order_date_not_in_finalized_period(v_order_date);

  if v_status <> 'open' then
    raise exception 'Ordering is not open for this lunch day';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  return new;
end;
$$;
