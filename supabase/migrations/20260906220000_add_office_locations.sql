-- ============================================================
-- Office locations: delivery defaults, order snapshots, management
-- ============================================================

-- ------------------------------------------------------------
-- Office locations
-- ------------------------------------------------------------

create table public.office_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.normalize_office_location_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(trim(p_name));
$$;

revoke all on function private.normalize_office_location_name(text) from public;

grant execute on function private.normalize_office_location_name(text)
to authenticated;

create unique index office_locations_normalized_name_idx
on public.office_locations (private.normalize_office_location_name(name));

create trigger office_locations_set_updated_at
before update on public.office_locations
for each row
execute function private.set_updated_at();

-- ------------------------------------------------------------
-- Profile default + order snapshots
-- ------------------------------------------------------------

alter table public.profiles
add column default_office_location_id uuid
references public.office_locations (id);

alter table public.orders
add column office_location_id uuid
references public.office_locations (id),
add column office_location_name text,
add column office_location_address text;

-- ------------------------------------------------------------
-- Trusted profile default location updates
-- ------------------------------------------------------------

create or replace function private.trusted_profile_default_location_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.trusted_profile_default_location', true), ''),
    'false'
  ) = 'true';
$$;

revoke all on function private.trusted_profile_default_location_active()
from public, anon, authenticated;

create or replace function private.activate_trusted_profile_default_location()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.trusted_profile_default_location', 'true', true);
end;
$$;

revoke all on function private.activate_trusted_profile_default_location()
from public, anon, authenticated;

create or replace function private.guard_profile_default_office_location_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.default_office_location_id is distinct from old.default_office_location_id then
    if not (select private.trusted_profile_default_location_active()) then
      raise exception
        'Default office location must be updated through set_my_default_office_location';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_default_office_location_change
on public.profiles;

create trigger guard_profile_default_office_location_change
before update on public.profiles
for each row
execute function private.guard_profile_default_office_location_change();

-- ------------------------------------------------------------
-- Location resolution for new/edited orders
-- ------------------------------------------------------------

create or replace function private.resolve_active_office_location_snapshot(
  p_office_location_id uuid default null,
  out o_location_id uuid,
  out o_location_name text,
  out o_location_address text
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_resolved_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_resolved_id := p_office_location_id;

  if v_resolved_id is null then
    select pr.default_office_location_id
    into v_resolved_id
    from public.profiles pr
    where pr.id = v_user_id;
  end if;

  if v_resolved_id is null then
    raise exception 'Delivery location is required';
  end if;

  select ol.id, ol.name, ol.address
  into o_location_id, o_location_name, o_location_address
  from public.office_locations ol
  where ol.id = v_resolved_id
    and ol.is_active = true;

  if not found then
    raise exception 'Delivery location is invalid or inactive';
  end if;
end;
$$;

revoke all on function private.resolve_active_office_location_snapshot(uuid)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Profile default RPC
-- ------------------------------------------------------------

create or replace function public.set_my_default_office_location(
  p_office_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_office_location_id is not null then
    if not exists (
      select 1
      from public.office_locations ol
      where ol.id = p_office_location_id
        and ol.is_active = true
    ) then
      raise exception 'Office location is invalid or inactive';
    end if;
  end if;

  perform private.activate_trusted_profile_default_location();

  update public.profiles
  set default_office_location_id = p_office_location_id
  where id = (select auth.uid());
end;
$$;

revoke execute on function public.set_my_default_office_location(uuid)
from public, anon;

grant execute on function public.set_my_default_office_location(uuid)
to authenticated;

-- ------------------------------------------------------------
-- Provider order submission
-- ------------------------------------------------------------

create or replace function public.submit_provider_order(
  p_provider_id uuid,
  p_order_date date,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
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
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  if (select auth.uid()) is null then
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
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address
  )
  values (
    (select auth.uid()),
    v_lunch_day_id,
    v_special_instructions,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address
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

drop function if exists public.submit_provider_order(uuid, date, jsonb, text);

revoke execute on function public.submit_provider_order(uuid, date, jsonb, text, uuid)
from public, anon;

grant execute on function public.submit_provider_order(uuid, date, jsonb, text, uuid)
to authenticated;

-- ------------------------------------------------------------
-- Replace order items (+ optional delivery location override)
-- ------------------------------------------------------------

create or replace function public.replace_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_office_location_id uuid default null
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
  v_current_location_id uuid;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
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

  select office_location_id
  into v_current_location_id
  from public.orders
  where id = p_order_id;

  if p_office_location_id is not null
     and p_office_location_id is distinct from v_current_location_id then
    select *
    into v_location_id, v_location_name, v_location_address
    from private.resolve_active_office_location_snapshot(p_office_location_id);

    update public.orders
    set
      meal_quantity = v_meal_quantity,
      office_location_id = v_location_id,
      office_location_name = v_location_name,
      office_location_address = v_location_address
    where id = p_order_id;
  else
    update public.orders
    set meal_quantity = v_meal_quantity
    where id = p_order_id;
  end if;

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

drop function if exists public.replace_order_items(uuid, jsonb, text);

revoke execute on function public.replace_order_items(uuid, jsonb, text, uuid)
from public, anon;

grant execute on function public.replace_order_items(uuid, jsonb, text, uuid)
to authenticated;

-- ------------------------------------------------------------
-- Legacy submit_order
-- ------------------------------------------------------------

create or replace function public.submit_order(
  p_lunch_day_id uuid,
  p_items jsonb,
  p_office_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_meal_quantity integer;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_location_id uuid;
  v_location_name text;
  v_location_address text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_location_id, v_location_name, v_location_address
  from private.resolve_active_office_location_snapshot(p_office_location_id);

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
    meal_quantity,
    office_location_id,
    office_location_name,
    office_location_address
  )
  values (
    (select auth.uid()),
    p_lunch_day_id,
    v_meal_quantity,
    v_location_id,
    v_location_name,
    v_location_address
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

drop function if exists public.submit_order(uuid, jsonb);

revoke execute on function public.submit_order(uuid, jsonb, uuid)
from public, anon;

grant execute on function public.submit_order(uuid, jsonb, uuid)
to authenticated;

-- ------------------------------------------------------------
-- Financial / export queries include delivery location snapshots
-- ------------------------------------------------------------

drop function if exists private.qualifying_financial_orders(uuid, date, date, uuid);

create or replace function private.qualifying_financial_orders(
  p_profile_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_period_id uuid default null
)
returns table (
  order_id uuid,
  profile_id uuid,
  employee_name text,
  employee_email text,
  order_date date,
  delivery_date date,
  provider_name text,
  order_status text,
  order_total numeric,
  office_location_name text,
  office_location_address text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.profile_id,
    pr.full_name,
    au.email::text,
    ld.order_date,
    ld.lunch_date,
    lpr.name,
    o.status,
    coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(12, 2),
    o.office_location_name,
    o.office_location_address
  from public.orders o
  join public.lunch_days ld on ld.id = o.lunch_day_id
  join public.order_items oi on oi.order_id = o.id
  join public.profiles pr on pr.id = o.profile_id
  join auth.users au on au.id = pr.id
  join public.lunch_providers lpr on lpr.id = ld.provider_id
  where o.status in ('submitted', 'fulfilled')
    and ld.provider_id is not null
    and ld.order_date is not null
    and (p_profile_id is null or o.profile_id = p_profile_id)
    and (p_start_date is null or ld.order_date >= p_start_date)
    and (p_end_date is null or ld.order_date <= p_end_date)
    and (
      p_period_id is null
      or exists (
        select 1
        from public.lunch_periods lper
        where lper.id = p_period_id
          and ld.order_date between lper.start_date and lper.end_date
      )
    )
  group by
    o.id,
    o.profile_id,
    pr.full_name,
    au.email,
    ld.order_date,
    ld.lunch_date,
    lpr.name,
    o.status,
    o.office_location_name,
    o.office_location_address;
$$;

create or replace function public.get_my_lunch_period_export_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_period record;
  v_employee record;
  v_orders jsonb;
  v_daily jsonb;
  v_summary record;
  v_daily_subsidy numeric;
begin
  v_user_id := (select private.current_user_id());

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lp.id, lp.label, lp.start_date, lp.end_date, lp.status
  into v_period
  from public.lunch_periods lp
  where lp.is_current = true
  limit 1;

  if not found then
    raise exception 'No current lunch period configured';
  end if;

  v_daily_subsidy := private.effective_daily_lunch_subsidy(v_period.id);

  select pr.full_name, au.email::text
  into v_employee
  from public.profiles pr
  join auth.users au on au.id = pr.id
  where pr.id = v_user_id;

  select *
  into v_summary
  from private.financial_subsidy_summary(
    v_user_id,
    null,
    null,
    v_period.id,
    null
  ) s;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', q.order_id,
      'order_date', q.order_date,
      'delivery_date', q.delivery_date,
      'provider_name', q.provider_name,
      'order_status', q.order_status,
      'order_total', q.order_total,
      'office_location_name', q.office_location_name,
      'office_location_address', q.office_location_address
    )
    order by q.order_date, q.order_id
  ), '[]'::jsonb)
  into v_orders
  from private.qualifying_financial_orders(
    v_user_id,
    null,
    null,
    v_period.id
  ) q;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_date', d.order_date,
      'gross', d.daily_gross,
      'subsidy_used', d.subsidy_used,
      'net_deduction', d.net_deduction,
      'order_count', d.order_count
    )
    order by d.order_date
  ), '[]'::jsonb)
  into v_daily
  from private.employee_daily_subsidy_breakdown(
    v_user_id,
    null,
    null,
    v_period.id,
    null
  ) d;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'period_id', v_period.id,
      'label', v_period.label,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'status', v_period.status,
      'daily_subsidy_rate', v_daily_subsidy
    ),
    'daily_lunch_subsidy', v_daily_subsidy,
    'employee', jsonb_build_object(
      'employee_id', v_user_id,
      'employee_name', v_employee.full_name,
      'employee_email', v_employee.email
    ),
    'order_count', v_summary.order_count,
    'qualifying_order_days', v_summary.qualifying_order_days,
    'period_total', v_summary.gross_total,
    'gross', v_summary.gross_total,
    'subsidy_used', v_summary.subsidy_used,
    'net_deduction', v_summary.net_deduction,
    'orders', v_orders,
    'daily_summary', v_daily
  );
end;
$$;

create or replace function public.get_lunch_period_financial_summary(p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period record;
  v_employees jsonb;
  v_orders jsonb;
  v_daily jsonb;
  v_grand_total numeric;
  v_grand_subsidy numeric;
  v_grand_net numeric;
  v_daily_subsidy numeric;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_all_financial_summaries()) then
    raise exception 'Financial summary access required';
  end if;

  select lp.id, lp.label, lp.start_date, lp.end_date, lp.status, lp.is_current
  into v_period
  from public.lunch_periods lp
  where lp.id = p_period_id;

  if not found then
    raise exception 'Lunch period does not exist';
  end if;

  v_daily_subsidy := private.effective_daily_lunch_subsidy(p_period_id);

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'employee_id', e.profile_id,
        'employee_name', e.employee_name,
        'employee_email', e.employee_email,
        'order_count', e.order_count,
        'qualifying_order_days', e.qualifying_order_days,
        'period_total', e.gross_total,
        'gross', e.gross_total,
        'subsidy_used', e.subsidy_used,
        'net_deduction', e.net_deduction
      )
      order by e.employee_name nulls last, e.employee_email
    ), '[]'::jsonb),
    coalesce(sum(e.gross_total), 0)::numeric(12, 2),
    coalesce(sum(e.subsidy_used), 0)::numeric(12, 2),
    coalesce(sum(e.net_deduction), 0)::numeric(12, 2)
  into v_employees, v_grand_total, v_grand_subsidy, v_grand_net
  from (
    select
      d.profile_id,
      pr.full_name as employee_name,
      au.email::text as employee_email,
      sum(d.order_count)::bigint as order_count,
      count(d.order_date)::bigint as qualifying_order_days,
      sum(d.daily_gross)::numeric(12, 2) as gross_total,
      sum(least(d.daily_gross, v_daily_subsidy))::numeric(12, 2) as subsidy_used,
      sum(d.daily_gross - least(d.daily_gross, v_daily_subsidy))::numeric(12, 2) as net_deduction
    from private.employee_daily_gross_spend(
      null,
      null,
      null,
      p_period_id
    ) d
    join public.profiles pr on pr.id = d.profile_id
    join auth.users au on au.id = pr.id
    group by d.profile_id, pr.full_name, au.email
  ) e;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', q.order_id,
      'employee_id', q.profile_id,
      'employee_name', q.employee_name,
      'employee_email', q.employee_email,
      'order_date', q.order_date,
      'delivery_date', q.delivery_date,
      'provider_name', q.provider_name,
      'order_status', q.order_status,
      'order_total', q.order_total,
      'office_location_name', q.office_location_name,
      'office_location_address', q.office_location_address
    )
    order by q.employee_name nulls last, q.order_date, q.order_id
  ), '[]'::jsonb)
  into v_orders
  from private.qualifying_financial_orders(
    null,
    null,
    null,
    p_period_id
  ) q;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'employee_id', d.profile_id,
      'employee_name', pr.full_name,
      'employee_email', au.email::text,
      'order_date', d.order_date,
      'gross', d.daily_gross,
      'subsidy_used', d.subsidy_used,
      'net_deduction', d.net_deduction,
      'order_count', d.order_count
    )
    order by pr.full_name nulls last, d.order_date
  ), '[]'::jsonb)
  into v_daily
  from private.employee_daily_subsidy_breakdown(
    null,
    null,
    null,
    p_period_id,
    null
  ) d
  join public.profiles pr on pr.id = d.profile_id
  join auth.users au on au.id = pr.id;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'period_id', v_period.id,
      'label', v_period.label,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date,
      'status', v_period.status,
      'is_current', v_period.is_current,
      'daily_subsidy_rate', v_daily_subsidy
    ),
    'daily_lunch_subsidy', v_daily_subsidy,
    'employees', v_employees,
    'orders', v_orders,
    'daily_summary', v_daily,
    'grand_total', v_grand_total,
    'grand_gross', v_grand_total,
    'grand_subsidy_used', v_grand_subsidy,
    'grand_net_deduction', v_grand_net
  );
end;
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.office_locations enable row level security;

grant select, insert, update on public.office_locations to authenticated;

revoke delete on public.office_locations from authenticated;

create policy "Authenticated users can view active office locations"
on public.office_locations
for select
to authenticated
using (is_active = true);

create policy "Users can view their default office location"
on public.office_locations
for select
to authenticated
using (
  id = (
    select pr.default_office_location_id
    from public.profiles pr
    where pr.id = (select auth.uid())
  )
);

create policy "Operations roles can manage office locations"
on public.office_locations
for insert
to authenticated
with check ((select private.can_manage_lunch_operations()));

create policy "Operations roles can update office locations"
on public.office_locations
for update
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));

-- Re-assert hardened order RPC execute grants after signature changes.
revoke execute on function public.submit_provider_order(uuid, date, jsonb, text, uuid)
from public, anon;

grant execute on function public.submit_provider_order(uuid, date, jsonb, text, uuid)
to authenticated;

revoke execute on function public.replace_order_items(uuid, jsonb, text, uuid)
from public, anon;

grant execute on function public.replace_order_items(uuid, jsonb, text, uuid)
to authenticated;

revoke execute on function public.submit_order(uuid, jsonb, uuid)
from public, anon;

grant execute on function public.submit_order(uuid, jsonb, uuid)
to authenticated;
