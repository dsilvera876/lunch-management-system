-- ============================================================
-- Roles & Permissions (Batch 1)
-- Migrate user -> staff; add hr, accounts, owner
-- ============================================================

-- ------------------------------------------------------------
-- 1. Role column migration
-- ------------------------------------------------------------

-- Drop the legacy constraint before changing role values.
-- create_core_schema.sql defines: check (role in ('user', 'admin'))
-- PostgreSQL names that inline CHECK profiles_role_check.
alter table public.profiles
  drop constraint if exists profiles_role_check;

-- Transitional constraint: permit legacy + new roles during data migration.
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'staff', 'hr', 'accounts', 'admin', 'owner'));

update public.profiles
set role = 'staff'
where role = 'user';

alter table public.profiles
  alter column role set default 'staff';

-- Guard: no legacy values may remain before the final constraint is installed.
do $$
begin
  if exists (
    select 1
    from public.profiles
    where role = 'user'
  ) then
    raise exception 'Migration incomplete: legacy user roles remain in profiles';
  end if;
end;
$$;

alter table public.profiles
  drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('staff', 'hr', 'accounts', 'admin', 'owner'));

create unique index if not exists profiles_single_owner_idx
  on public.profiles (role)
  where role = 'owner';


-- ------------------------------------------------------------
-- 2. Authorization helpers
-- ------------------------------------------------------------

create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is not null then
      (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
    else
      (select auth.uid())
  end;
$$;

grant execute on function private.current_user_id() to postgres;

create or replace function private.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select private.current_user_id())
      and role = any (p_roles)
  );
$$;

revoke all on function private.has_role(text[]) from public;
grant execute on function private.has_role(text[]) to authenticated;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['owner']);
$$;

revoke all on function private.is_owner() from public;
grant execute on function private.is_owner() to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['admin']);
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['admin', 'owner']);
$$;

revoke all on function private.is_admin_or_owner() from public;
grant execute on function private.is_admin_or_owner() to authenticated;

create or replace function private.can_manage_lunch_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'admin', 'owner']);
$$;

revoke all on function private.can_manage_lunch_operations() from public;
grant execute on function private.can_manage_lunch_operations() to authenticated;

create or replace function private.can_view_all_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_view_all_orders() from public;
grant execute on function private.can_view_all_orders() to authenticated;

create or replace function private.can_fulfill_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'admin', 'owner']);
$$;

revoke all on function private.can_fulfill_orders() from public;
grant execute on function private.can_fulfill_orders() to authenticated;

create or replace function private.can_manage_roles()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['admin', 'owner']);
$$;

revoke all on function private.can_manage_roles() from public;
grant execute on function private.can_manage_roles() to authenticated;


-- ------------------------------------------------------------
-- 3. Profile role / owner protection
-- ------------------------------------------------------------

-- pgcrypto lives in the extensions schema on Supabase (local and hosted).
-- Migrations run with a search_path that may not include extensions, so
-- schema-qualify extension functions and ensure the extension exists.
create extension if not exists pgcrypto with schema extensions;

-- Trusted role-change gate: secret readable only by SECURITY DEFINER
-- helpers. The trigger accepts role changes only when a transaction-local
-- GUC matches this secret, which only private.activate_trusted_role_change()
-- can set. Authenticated users cannot read the secret or call the activator.
create table if not exists private.role_change_gate (
  id int primary key default 1 check (id = 1),
  gate_secret text not null default encode(extensions.gen_random_bytes(32), 'hex')
);

insert into private.role_change_gate (id, gate_secret)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

revoke all on table private.role_change_gate from public, anon, authenticated;

create or replace function private.trusted_role_change_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.role_change_gate', true), ''),
    ''
  ) = (
    select gate_secret
    from private.role_change_gate
    where id = 1
  );
$$;

revoke all on function private.trusted_role_change_active() from public, anon, authenticated;

create or replace function private.activate_trusted_role_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config(
    'app.role_change_gate',
    (select gate_secret from private.role_change_gate where id = 1),
    true
  );
end;
$$;

revoke all on function private.activate_trusted_role_change() from public, anon, authenticated;

create or replace function private.deactivate_trusted_role_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.role_change_gate', '', true);
end;
$$;

revoke all on function private.deactivate_trusted_role_change() from public, anon, authenticated;

create or replace function private.apply_profile_role(
  p_profile_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.activate_trusted_role_change();

  update public.profiles
  set role = p_new_role
  where id = p_profile_id;

  perform private.deactivate_trusted_role_change();
end;
$$;

revoke all on function private.apply_profile_role(uuid, text) from public, anon, authenticated;
grant execute on function private.apply_profile_role(uuid, text) to postgres;

create or replace function private.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if not (select private.trusted_role_change_active()) then
      if old.role = 'owner' then
        raise exception 'Owner role can only change through ownership transfer';
      end if;

      raise exception 'Role changes must use assign_user_role or transfer_ownership';
    end if;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' then
    raise exception 'Owner profile cannot be deleted';
  end if;

  return coalesce(new, old);
end;
$$;

alter table public.profiles force row level security;

drop trigger if exists guard_profile_role_change on public.profiles;

create trigger guard_profile_role_change
  before update or delete on public.profiles
  for each row
  execute function private.guard_profile_role_change();


-- ------------------------------------------------------------
-- 4. Profiles RLS
-- ------------------------------------------------------------

drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Role managers can view all profiles"
on public.profiles
for select
to authenticated
using ((select private.can_manage_roles()));


-- ------------------------------------------------------------
-- 5. Lunch days (legacy) — Admin + Owner only
-- ------------------------------------------------------------

drop policy if exists "Admins can manage lunch days" on public.lunch_days;

create policy "Admins and owners can manage lunch days"
on public.lunch_days
for all
to authenticated
using ((select private.is_admin_or_owner()))
with check ((select private.is_admin_or_owner()));


-- ------------------------------------------------------------
-- 6. Menu items — legacy manual lunch days (Admin + Owner)
-- Provider recurring menus use provider_menu_items instead.
-- ------------------------------------------------------------

drop policy if exists "Admins can manage menu items" on public.menu_items;

create policy "Admins and owners can manage menu items"
on public.menu_items
for all
to authenticated
using ((select private.is_admin_or_owner()))
with check ((select private.is_admin_or_owner()));


-- ------------------------------------------------------------
-- 7. Orders
-- ------------------------------------------------------------

drop policy if exists "Admins can manage orders" on public.orders;

create policy "Authorized roles can view all orders"
on public.orders
for select
to authenticated
using ((select private.can_view_all_orders()));

create policy "Fulfillment roles can update orders"
on public.orders
for update
to authenticated
using ((select private.can_fulfill_orders()))
with check ((select private.can_fulfill_orders()));


-- ------------------------------------------------------------
-- 8. Order items
-- ------------------------------------------------------------

drop policy if exists "Admins can manage order items" on public.order_items;

create policy "Authorized roles can view all order items"
on public.order_items
for select
to authenticated
using ((select private.can_view_all_orders()));

create policy "Fulfillment roles can manage order items"
on public.order_items
for all
to authenticated
using ((select private.can_fulfill_orders()))
with check ((select private.can_fulfill_orders()));


-- ------------------------------------------------------------
-- 9. Providers / recurring menus
-- ------------------------------------------------------------

drop policy if exists "Admins can manage providers" on public.lunch_providers;
drop policy if exists "Admins can manage provider menu items" on public.provider_menu_items;
drop policy if exists "Admins can manage provider menu item weekdays" on public.provider_menu_item_weekdays;

create policy "Operations roles can manage providers"
on public.lunch_providers
for all
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));

create policy "Operations roles can manage provider menu items"
on public.provider_menu_items
for all
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));

create policy "Operations roles can manage provider menu item weekdays"
on public.provider_menu_item_weekdays
for all
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));


-- ------------------------------------------------------------
-- 10. App settings / cutoff
-- ------------------------------------------------------------

drop policy if exists "Admins can update app settings" on public.app_settings;

create policy "Operations roles can update app settings"
on public.app_settings
for update
to authenticated
using ((select private.can_manage_lunch_operations()))
with check ((select private.can_manage_lunch_operations()));


-- ------------------------------------------------------------
-- 11. Fulfillment RPC
-- ------------------------------------------------------------

create or replace function public.fulfill_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_fulfill_orders()) then
    raise exception 'Fulfillment access required';
  end if;

  select status
  into v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if v_status <> 'submitted' then
    raise exception 'Only submitted orders can be fulfilled';
  end if;

  update public.orders
  set status = 'fulfilled'
  where id = p_order_id;
end;
$$;

revoke execute on function public.fulfill_order(uuid) from public, anon;
grant execute on function public.fulfill_order(uuid) to authenticated;


-- ------------------------------------------------------------
-- 12. Role assignment RPC
-- ------------------------------------------------------------

create or replace function public.assign_user_role(
  p_profile_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role management access required';
  end if;

  if p_role not in ('staff', 'hr', 'accounts', 'admin') then
    raise exception 'Invalid assignable role';
  end if;

  select role
  into v_target_role
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Profile does not exist';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner role cannot be changed through role assignment';
  end if;

  if p_profile_id = (select private.current_user_id()) and (select private.is_owner()) then
    raise exception 'Owner cannot change their own role through role assignment';
  end if;

  perform private.apply_profile_role(p_profile_id, p_role);
end;
$$;

revoke execute on function public.assign_user_role(uuid, text) from public, anon;
grant execute on function public.assign_user_role(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 13. Ownership transfer RPC
-- ------------------------------------------------------------

create or replace function public.transfer_ownership(
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_owner_id uuid;
  v_target_role text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.is_owner()) then
    raise exception 'Only the current Owner may transfer ownership';
  end if;

  if p_new_owner_id = (select private.current_user_id()) then
    raise exception 'Cannot transfer ownership to yourself';
  end if;

  select id
  into v_current_owner_id
  from public.profiles
  where role = 'owner'
  for update;

  if v_current_owner_id is distinct from (select private.current_user_id()) then
    raise exception 'Only the current Owner may transfer ownership';
  end if;

  select role
  into v_target_role
  from public.profiles
  where id = p_new_owner_id
  for update;

  if not found then
    raise exception 'Target profile does not exist';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Target is already Owner';
  end if;

  perform private.apply_profile_role(v_current_owner_id, 'admin');
  perform private.apply_profile_role(p_new_owner_id, 'owner');
end;
$$;

revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;


-- ------------------------------------------------------------
-- 13b. One-time first Owner bootstrap (privileged callers only)
-- ------------------------------------------------------------

create or replace function public.bootstrap_first_owner(
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.profiles
    where role = 'owner'
  ) then
    raise exception 'An Owner already exists';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_profile_id
  ) then
    raise exception 'Target profile does not exist';
  end if;

  perform private.apply_profile_role(p_profile_id, 'owner');
end;
$$;

revoke all on function public.bootstrap_first_owner(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_owner(uuid) to postgres, service_role;


-- ------------------------------------------------------------
-- 14. User directory for role management UI
-- ------------------------------------------------------------

create or replace function public.list_manageable_users()
returns table (
  id uuid,
  full_name text,
  email text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role management access required';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.full_name nulls last, u.email;
end;
$$;

revoke execute on function public.list_manageable_users() from public, anon;
grant execute on function public.list_manageable_users() to authenticated;
