-- ============================================================
-- Menu item types, selling units, order composition, and
-- per-order special instructions.
-- ============================================================

-- Staging/dev provider data lacks explicit classification; clear it.
delete from public.order_items
where order_id in (
  select o.id
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  where ld.provider_id is not null
);

delete from public.orders
where lunch_day_id in (
  select id from public.lunch_days where provider_id is not null
);

delete from public.menu_items
where provider_menu_item_id is not null;

delete from public.lunch_days
where provider_id is not null;

delete from public.provider_menu_item_weekdays;
delete from public.provider_menu_items;

-- ------------------------------------------------------------
-- Recurring catalog
-- ------------------------------------------------------------

alter table public.provider_menu_items
  add column item_type text not null
    check (item_type in ('main', 'side', 'standalone')),
  add column unit_label text not null default 'Each'
    check (length(trim(unit_label)) > 0 and length(unit_label) <= 40);

-- ------------------------------------------------------------
-- Date-specific snapshots
-- ------------------------------------------------------------

alter table public.menu_items
  add column item_type text not null default 'standalone'
    check (item_type in ('main', 'side', 'standalone')),
  add column unit_label text not null default 'Each'
    check (length(trim(unit_label)) > 0 and length(unit_label) <= 40);

alter table public.menu_items
  alter column item_type drop default;

-- ------------------------------------------------------------
-- Order-level special instructions
-- ------------------------------------------------------------

alter table public.orders
  add column special_instructions text
    check (
      special_instructions is null
      or (
        length(trim(special_instructions)) > 0
        and length(special_instructions) <= 500
      )
    );

-- Bundle multiplier for meal orders; NULL for standalone-only orders.
alter table public.orders
  add column meal_quantity integer
    check (meal_quantity is null or meal_quantity >= 1);

-- ------------------------------------------------------------
-- Composition validation (central authority)
-- ------------------------------------------------------------

create or replace function private.normalize_special_instructions(
  p_special_instructions text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_special_instructions is null then null
    when length(trim(p_special_instructions)) = 0 then null
    when length(p_special_instructions) > 500 then null
    else trim(p_special_instructions)
  end;
$$;

create or replace function private.validate_order_composition_counts(
  p_main_count integer,
  p_side_count integer,
  p_standalone_count integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_main_count = 0 and p_side_count = 0 and p_standalone_count = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if p_main_count > 1 then
    raise exception 'Order can include only one main item';
  end if;

  if p_main_count = 1 and p_side_count = 0 then
    raise exception 'A main item requires at least one side item';
  end if;

  if p_main_count = 0 and p_side_count > 0 then
    raise exception 'Side items require a main item';
  end if;

  if p_main_count = 0 and p_side_count = 0 and p_standalone_count = 0 then
    raise exception 'Standalone orders must include at least one standalone item';
  end if;
end;
$$;

create or replace function private.validate_provider_order_payload(
  p_provider_id uuid,
  p_order jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_main_id uuid;
  v_side_ids uuid[] := '{}';
  v_meal_quantity integer;
  v_standalone_items jsonb;
  v_side_id uuid;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_quantity integer;
  v_item_type text;
  v_seen_ids uuid[] := '{}';
  v_side_count integer := 0;
  v_standalone_count integer := 0;
begin
  if jsonb_typeof(p_order) <> 'object' then
    raise exception 'Invalid order payload';
  end if;

  begin
    v_main_id := nullif(p_order ->> 'main_provider_menu_item_id', '')::uuid;
  exception
    when others then
      raise exception 'Invalid order payload';
  end;

  v_standalone_items := coalesce(p_order -> 'standalone_items', '[]'::jsonb);

  if jsonb_typeof(v_standalone_items) <> 'array' then
    raise exception 'Invalid order payload';
  end if;

  begin
    if p_order ->> 'meal_quantity' is null
       or length(trim(p_order ->> 'meal_quantity')) = 0 then
      v_meal_quantity := null;
    else
      v_meal_quantity := (p_order ->> 'meal_quantity')::integer;
    end if;
  exception
    when others then
      raise exception 'Meal quantity must be a positive integer';
  end;

  if p_order ? 'side_provider_menu_item_ids' then
    if jsonb_typeof(p_order -> 'side_provider_menu_item_ids') <> 'array' then
      raise exception 'Invalid order payload';
    end if;

    for v_side_id in
      select value::uuid
      from jsonb_array_elements_text(p_order -> 'side_provider_menu_item_ids')
    loop
      v_side_ids := array_append(v_side_ids, v_side_id);
    end loop;
  end if;

  v_side_count := coalesce(array_length(v_side_ids, 1), 0);

  for v_item in
    select value
    from jsonb_array_elements(v_standalone_items)
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

    if v_provider_menu_item_id = any (v_seen_ids) then
      raise exception 'Duplicate menu items are not allowed in one order';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_provider_menu_item_id);

    select pmi.item_type
    into v_item_type
    from public.provider_menu_items pmi
    where pmi.id = v_provider_menu_item_id
      and pmi.provider_id = p_provider_id
      and pmi.active = true;

    if not found then
      raise exception 'Menu item is invalid or inactive';
    end if;

    if v_item_type <> 'standalone' then
      raise exception 'Menu item has an invalid type';
    end if;

    v_standalone_count := v_standalone_count + 1;
  end loop;

  if v_main_id is not null
     or v_side_count > 0
     or v_meal_quantity is not null then
    if v_main_id is null then
      raise exception 'Side items require a main item';
    end if;

    if v_side_count = 0 then
      raise exception 'A main item requires at least one side item';
    end if;

    if v_meal_quantity is null or v_meal_quantity <= 0 then
      raise exception 'Meal quantity must be greater than zero';
    end if;

    if v_main_id = any (v_seen_ids) then
      raise exception 'Duplicate menu items are not allowed in one order';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_main_id);

    select pmi.item_type
    into v_item_type
    from public.provider_menu_items pmi
    where pmi.id = v_main_id
      and pmi.provider_id = p_provider_id
      and pmi.active = true;

    if not found then
      raise exception 'Menu item is invalid or inactive';
    end if;

    if v_item_type <> 'main' then
      raise exception 'Menu item has an invalid type';
    end if;

    foreach v_side_id in array v_side_ids
    loop
      if v_side_id = any (v_seen_ids) then
        raise exception 'Duplicate menu items are not allowed in one order';
      end if;

      v_seen_ids := array_append(v_seen_ids, v_side_id);

      select pmi.item_type
      into v_item_type
      from public.provider_menu_items pmi
      where pmi.id = v_side_id
        and pmi.provider_id = p_provider_id
        and pmi.active = true;

      if not found then
        raise exception 'Menu item is invalid or inactive';
      end if;

      if v_item_type <> 'side' then
        raise exception 'Menu item has an invalid type';
      end if;
    end loop;

    perform private.validate_order_composition_counts(
      1,
      v_side_count,
      v_standalone_count
    );

    return v_meal_quantity;
  end if;

  if v_meal_quantity is not null then
    raise exception 'Standalone-only orders cannot include meal quantity';
  end if;

  perform private.validate_order_composition_counts(
    0,
    0,
    v_standalone_count
  );

  return null;
end;
$$;

create or replace function private.build_provider_order_items(
  p_order jsonb,
  p_meal_quantity integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_main_id uuid;
  v_side_id uuid;
  v_item jsonb;
begin
  v_main_id := nullif(p_order ->> 'main_provider_menu_item_id', '')::uuid;

  if v_main_id is not null then
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'provider_menu_item_id',
        v_main_id,
        'quantity',
        p_meal_quantity
      )
    );

    for v_side_id in
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(p_order -> 'side_provider_menu_item_ids', '[]'::jsonb)
      )
    loop
      v_result := v_result || jsonb_build_array(
        jsonb_build_object(
          'provider_menu_item_id',
          v_side_id,
          'quantity',
          p_meal_quantity
        )
      );
    end loop;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_order -> 'standalone_items', '[]'::jsonb))
  loop
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'provider_menu_item_id',
        v_item ->> 'provider_menu_item_id',
        'quantity',
        (v_item ->> 'quantity')::integer
      )
    );
  end loop;

  return v_result;
end;
$$;

create or replace function private.validate_snapshot_order_payload(
  p_lunch_day_id uuid,
  p_order jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_main_id uuid;
  v_side_ids uuid[] := '{}';
  v_meal_quantity integer;
  v_standalone_items jsonb;
  v_side_id uuid;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_item_type text;
  v_seen_ids uuid[] := '{}';
  v_side_count integer := 0;
  v_standalone_count integer := 0;
begin
  if jsonb_typeof(p_order) <> 'object' then
    raise exception 'Invalid order payload';
  end if;

  begin
    v_main_id := nullif(p_order ->> 'main_menu_item_id', '')::uuid;
  exception
    when others then
      raise exception 'Invalid order payload';
  end;

  v_standalone_items := coalesce(p_order -> 'standalone_items', '[]'::jsonb);

  if jsonb_typeof(v_standalone_items) <> 'array' then
    raise exception 'Invalid order payload';
  end if;

  begin
    if p_order ->> 'meal_quantity' is null
       or length(trim(p_order ->> 'meal_quantity')) = 0 then
      v_meal_quantity := null;
    else
      v_meal_quantity := (p_order ->> 'meal_quantity')::integer;
    end if;
  exception
    when others then
      raise exception 'Meal quantity must be a positive integer';
  end;

  if p_order ? 'side_menu_item_ids' then
    if jsonb_typeof(p_order -> 'side_menu_item_ids') <> 'array' then
      raise exception 'Invalid order payload';
    end if;

    for v_side_id in
      select value::uuid
      from jsonb_array_elements_text(p_order -> 'side_menu_item_ids')
    loop
      v_side_ids := array_append(v_side_ids, v_side_id);
    end loop;
  end if;

  v_side_count := coalesce(array_length(v_side_ids, 1), 0);

  for v_item in
    select value
    from jsonb_array_elements(v_standalone_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    if v_menu_item_id = any (v_seen_ids) then
      raise exception 'Duplicate menu items are not allowed in one order';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_menu_item_id);

    select mi.item_type
    into v_item_type
    from public.menu_items mi
    where mi.id = v_menu_item_id
      and mi.lunch_day_id = p_lunch_day_id
      and mi.is_active = true;

    if not found then
      raise exception 'Menu item is invalid or inactive';
    end if;

    if v_item_type <> 'standalone' then
      raise exception 'Menu item has an invalid type';
    end if;

    v_standalone_count := v_standalone_count + 1;
  end loop;

  if v_main_id is not null
     or v_side_count > 0
     or v_meal_quantity is not null then
    if v_main_id is null then
      raise exception 'Side items require a main item';
    end if;

    if v_side_count = 0 then
      raise exception 'A main item requires at least one side item';
    end if;

    if v_meal_quantity is null or v_meal_quantity <= 0 then
      raise exception 'Meal quantity must be greater than zero';
    end if;

    if v_main_id = any (v_seen_ids) then
      raise exception 'Duplicate menu items are not allowed in one order';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_main_id);

    select mi.item_type
    into v_item_type
    from public.menu_items mi
    where mi.id = v_main_id
      and mi.lunch_day_id = p_lunch_day_id
      and mi.is_active = true;

    if not found then
      raise exception 'Menu item is invalid or inactive';
    end if;

    if v_item_type <> 'main' then
      raise exception 'Menu item has an invalid type';
    end if;

    foreach v_side_id in array v_side_ids
    loop
      if v_side_id = any (v_seen_ids) then
        raise exception 'Duplicate menu items are not allowed in one order';
      end if;

      v_seen_ids := array_append(v_seen_ids, v_side_id);

      select mi.item_type
      into v_item_type
      from public.menu_items mi
      where mi.id = v_side_id
        and mi.lunch_day_id = p_lunch_day_id
        and mi.is_active = true;

      if not found then
        raise exception 'Menu item is invalid or inactive';
      end if;

      if v_item_type <> 'side' then
        raise exception 'Menu item has an invalid type';
      end if;
    end loop;

    perform private.validate_order_composition_counts(
      1,
      v_side_count,
      v_standalone_count
    );

    return v_meal_quantity;
  end if;

  if v_meal_quantity is not null then
    raise exception 'Standalone-only orders cannot include meal quantity';
  end if;

  perform private.validate_order_composition_counts(
    0,
    0,
    v_standalone_count
  );

  return null;
end;
$$;

create or replace function private.build_snapshot_order_items(
  p_order jsonb,
  p_meal_quantity integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_main_id uuid;
  v_side_id uuid;
  v_item jsonb;
begin
  v_main_id := nullif(p_order ->> 'main_menu_item_id', '')::uuid;

  if v_main_id is not null then
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id',
        v_main_id,
        'quantity',
        p_meal_quantity
      )
    );

    for v_side_id in
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(p_order -> 'side_menu_item_ids', '[]'::jsonb)
      )
    loop
      v_result := v_result || jsonb_build_array(
        jsonb_build_object(
          'menu_item_id',
          v_side_id,
          'quantity',
          p_meal_quantity
        )
      );
    end loop;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_order -> 'standalone_items', '[]'::jsonb))
  loop
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id',
        v_item ->> 'menu_item_id',
        'quantity',
        (v_item ->> 'quantity')::integer
      )
    );
  end loop;

  return v_result;
end;
$$;

create or replace function private.enforce_order_item_meal_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_meal_quantity integer;
  v_item_type text;
begin
  select o.meal_quantity, mi.item_type
  into v_meal_quantity, v_item_type
  from public.orders o
  join public.menu_items mi on mi.id = NEW.menu_item_id
  where o.id = NEW.order_id;

  if v_item_type in ('main', 'side') then
    if v_meal_quantity is null then
      raise exception 'Meal bundle items require meal quantity on the order';
    end if;

    if NEW.quantity <> v_meal_quantity then
      raise exception 'Main and side item quantities must match meal quantity';
    end if;
  elsif v_item_type = 'standalone' then
    if NEW.quantity is null or NEW.quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
  else
    raise exception 'Menu item has an invalid type';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_order_item_meal_quantity on public.order_items;

create trigger enforce_order_item_meal_quantity
before insert or update on public.order_items
for each row
execute function private.enforce_order_item_meal_quantity();

-- ------------------------------------------------------------
-- Snapshot provisioning
-- ------------------------------------------------------------

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
begin
  if not exists (
    select 1
    from public.lunch_providers
    where id = p_provider_id
      and active = true
  ) then
    raise exception 'Provider is not available';
  end if;

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  v_delivery_date := public.delivery_date_for_order_date(p_order_date);

  if v_delivery_date is null then
    raise exception 'Unable to determine delivery date';
  end if;

  select id
  into v_lunch_day_id
  from public.lunch_days
  where lunch_date = v_delivery_date
    and provider_id = p_provider_id;

  if found then
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
  returning id into v_lunch_day_id;

  insert into public.menu_items (
    lunch_day_id,
    provider_menu_item_id,
    name,
    description,
    price,
    item_type,
    unit_label,
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
    true
  from public.provider_menu_items pmi
  join public.provider_menu_item_weekdays pmw
    on pmw.provider_menu_item_id = pmi.id
  where pmi.provider_id = p_provider_id
    and pmi.active = true
    and pmw.weekday = v_order_weekday;

  return v_lunch_day_id;
end;
$$;

-- ------------------------------------------------------------
-- Provider order submission
-- ------------------------------------------------------------

create or replace function public.submit_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text default null
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
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_provider_menu_item_id uuid;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_meal_quantity := private.validate_provider_order_payload(
    p_provider_id,
    p_items
  );

  v_items := private.build_provider_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_order_weekday := public.iso_weekday(p_order_date);

  if v_order_weekday is null then
    raise exception 'Ordering is not available on weekends';
  end if;

  v_special_instructions :=
    private.normalize_special_instructions(p_special_instructions);

  if p_special_instructions is not null
     and length(trim(p_special_instructions)) > 0
     and v_special_instructions is null then
    raise exception 'Special instructions are too long';
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
      raise exception 'Menu item is invalid or inactive';
    end if;
  end loop;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    special_instructions,
    meal_quantity
  )
  values (
    (select auth.uid()),
    v_lunch_day_id,
    v_special_instructions,
    v_meal_quantity
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

  return v_order_id;
end;
$$;

revoke execute on function public.submit_provider_order(uuid, date, jsonb, text)
from public, anon;

-- Drop prior RPC signatures so only the extended versions remain.
drop function if exists public.submit_provider_order(uuid, date, jsonb);
drop function if exists public.replace_order_items(uuid, jsonb);

grant execute on function public.submit_provider_order(uuid, date, jsonb, text)
to authenticated;

-- ------------------------------------------------------------
-- Replace order items
-- ------------------------------------------------------------

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_special_instructions text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_lunch_day_id uuid;
  v_order_status text;
  v_day_status text;
  v_deadline timestamptz;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_special_instructions text;
  v_update_instructions boolean := p_special_instructions is not null;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select profile_id, lunch_day_id, status
  into v_profile_id, v_lunch_day_id, v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_profile_id <> (select auth.uid()) then
    raise exception 'Not authorized to edit this order';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Only submitted orders can be edited';
  end if;

  perform private.validate_order_not_in_finalized_period(p_order_id);
  perform private.validate_provider_order_mutable(v_lunch_day_id);

  select ld.status, public.effective_order_deadline(ld.id)
  into v_day_status, v_deadline
  from public.lunch_days ld
  where ld.id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(
    v_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if v_update_instructions then
    v_special_instructions :=
      private.normalize_special_instructions(p_special_instructions);

    if length(trim(coalesce(p_special_instructions, ''))) > 0
       and v_special_instructions is null then
      raise exception 'Special instructions are too long';
    end if;
  end if;

  delete from public.order_items
  where order_id = p_order_id;

  update public.orders
  set meal_quantity = v_meal_quantity
  where id = p_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    insert into public.order_items (
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity
    )
    values (
      p_order_id,
      v_menu_item_id,
      v_lunch_day_id,
      v_quantity
    );
  end loop;

  if v_update_instructions then
    update public.orders
    set special_instructions = v_special_instructions
    where id = p_order_id;
  end if;
end;
$$;

revoke execute on function public.replace_order_items(uuid, jsonb, text)
from public, anon;

grant execute on function public.replace_order_items(uuid, jsonb, text)
to authenticated;

-- ------------------------------------------------------------
-- Legacy lunch-day submit order (same payload shape as replace)
-- ------------------------------------------------------------

create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_meal_quantity := private.validate_snapshot_order_payload(
    p_lunch_day_id,
    p_items
  );

  v_items := private.build_snapshot_order_items(p_items, v_meal_quantity);

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders (
    profile_id,
    lunch_day_id,
    meal_quantity
  )
  values (
    (select auth.uid()),
    p_lunch_day_id,
    v_meal_quantity
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
  loop
    begin
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid order item';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

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

revoke execute on function public.submit_order(uuid, jsonb)
from public, anon;

grant execute on function public.submit_order(uuid, jsonb)
to authenticated;
