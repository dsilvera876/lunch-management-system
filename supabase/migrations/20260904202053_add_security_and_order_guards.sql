-- ============================================================
-- Private helper schema
-- ============================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;


-- ============================================================
-- Admin helper
-- ============================================================

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;


-- ============================================================
-- Automatically create profile when a Supabase user is created
-- ============================================================

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();


-- ============================================================
-- updated_at helper
-- ============================================================

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger lunch_days_set_updated_at
  before update on public.lunch_days
  for each row execute function private.set_updated_at();

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function private.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();


-- ============================================================
-- Order validation
-- ============================================================

create or replace function private.validate_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_deadline timestamptz;
begin
  select status, order_deadline
  into v_status, v_deadline
  from public.lunch_days
  where id = new.lunch_day_id;

  if not found then
    raise exception 'Lunch day does not exist';
  end if;

  if v_status <> 'open' then
    raise exception 'Ordering is not open for this lunch day';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  return new;
end;
$$;

create trigger validate_order_before_insert
  before insert on public.orders
  for each row
  execute function private.validate_new_order();


-- ============================================================
-- Protect menu pricing and lunch-day consistency
-- ============================================================

create or replace function private.prepare_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lunch_day_id uuid;
  v_order_status text;
  v_menu_price numeric(10,2);
  v_day_status text;
  v_deadline timestamptz;
begin
  select lunch_day_id, status
  into v_lunch_day_id, v_order_status
  from public.orders
  where id = new.order_id;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_order_status <> 'submitted' then
    raise exception 'Items cannot be added to this order';
  end if;

  select price
  into v_menu_price
  from public.menu_items
  where id = new.menu_item_id
    and lunch_day_id = v_lunch_day_id
    and is_active = true;

  if not found then
    raise exception 'Menu item is invalid or inactive';
  end if;

  select status, order_deadline
  into v_day_status, v_deadline
  from public.lunch_days
  where id = v_lunch_day_id;

  if v_day_status <> 'open' then
    raise exception 'Ordering is not open';
  end if;

  if now() > v_deadline then
    raise exception 'The ordering deadline has passed';
  end if;

  -- Never trust price or lunch_day_id supplied by the client.
  new.lunch_day_id := v_lunch_day_id;
  new.unit_price := v_menu_price;

  return new;
end;
$$;

create trigger prepare_order_item_before_insert
  before insert on public.order_items
  for each row
  execute function private.prepare_order_item();


-- ============================================================
-- Enable Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.lunch_days enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;


-- Anonymous users receive no table access.
revoke all on public.profiles from anon;
revoke all on public.lunch_days from anon;
revoke all on public.menu_items from anon;
revoke all on public.orders from anon;
revoke all on public.order_items from anon;

-- Authenticated users receive SQL privileges.
-- RLS policies below determine which rows/actions are actually allowed.
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.lunch_days to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;


-- ============================================================
-- Profiles policies
-- ============================================================

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and role = 'user'
);

create policy "Admins can manage profiles"
on public.profiles
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));


-- ============================================================
-- Lunch day policies
-- ============================================================

create policy "Authenticated users can view lunch days"
on public.lunch_days
for select
to authenticated
using (true);

create policy "Admins can manage lunch days"
on public.lunch_days
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));


-- ============================================================
-- Menu item policies
-- ============================================================

create policy "Authenticated users can view menu items"
on public.menu_items
for select
to authenticated
using (true);

create policy "Admins can manage menu items"
on public.menu_items
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));


-- ============================================================
-- Order policies
-- ============================================================

create policy "Users can view their own orders"
on public.orders
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Users can create their own orders"
on public.orders
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'submitted'
);

create policy "Admins can manage orders"
on public.orders
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));


-- ============================================================
-- Order item policies
-- ============================================================

create policy "Users can view their own order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.profile_id = (select auth.uid())
  )
);

create policy "Users can add items to their own orders"
on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.profile_id = (select auth.uid())
  )
);

create policy "Admins can manage order items"
on public.order_items
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));