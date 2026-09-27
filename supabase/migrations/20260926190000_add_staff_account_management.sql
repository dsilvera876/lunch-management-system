-- ============================================================
-- HR staff account management + inactive user enforcement
-- ============================================================

-- ------------------------------------------------------------
-- Account status on application profiles
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'inactive'));

update public.profiles
set account_status = 'active'
where account_status is distinct from 'active';

-- ------------------------------------------------------------
-- Inactive users are treated as unauthenticated in RPC guards
-- ------------------------------------------------------------

create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select case
      when nullif(current_setting('request.jwt.claims', true), '') is not null then
        (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
      else
        (select auth.uid())
    end as id
  )
  select a.id
  from actor a
  inner join public.profiles p
    on p.id = a.id
   and p.account_status = 'active'
  where a.id is not null;
$$;

grant execute on function private.current_user_id() to postgres;

-- ------------------------------------------------------------
-- HR-only staff account management capability
-- ------------------------------------------------------------

create or replace function private.can_manage_staff_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr']);
$$;

revoke all on function private.can_manage_staff_accounts() from public;
grant execute on function private.can_manage_staff_accounts() to authenticated;

-- ------------------------------------------------------------
-- HR staff directory search
-- ------------------------------------------------------------

create or replace function public.search_staff_directory(
  p_search text default null,
  p_status text default null,
  p_role text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  employee_id text,
  role text,
  status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_staff_accounts()) then
    raise exception 'Staff account management access required';
  end if;

  v_search := nullif(btrim(p_search), '');
  v_limit := greatest(coalesce(p_limit, 50), 1);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  if p_status is not null and p_status not in ('active', 'inactive') then
    raise exception 'Invalid status filter';
  end if;

  if p_role is not null and p_role not in ('staff', 'hr', 'accounts', 'admin', 'owner') then
    raise exception 'Invalid role filter';
  end if;

  return query
  with filtered as (
    select
      p.id as profile_id,
      p.full_name,
      btrim(au.email::text) as email,
      sr.employee_id,
      p.role,
      p.account_status as status
    from public.profiles p
    inner join auth.users au on au.id = p.id
    left join private.staff_registry sr on sr.profile_id = p.id
    where nullif(btrim(au.email::text), '') is not null
      and (p_status is null or p.account_status = p_status)
      and (p_role is null or p.role = p_role)
      and (
        v_search is null
        or p.full_name ilike '%' || v_search || '%'
        or btrim(au.email::text) ilike '%' || v_search || '%'
        or sr.employee_id = v_search
      )
  )
  select
    f.profile_id,
    f.full_name,
    f.email,
    f.employee_id,
    f.role,
    f.status,
    count(*) over () as total_count
  from filtered f
  order by f.full_name nulls last, f.email
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.search_staff_directory(text, text, text, integer, integer) from public, anon;
grant execute on function public.search_staff_directory(text, text, text, integer, integer) to authenticated;

-- ------------------------------------------------------------
-- HR display name update
-- ------------------------------------------------------------

create or replace function public.update_staff_name(
  p_profile_id uuid,
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_staff_accounts()) then
    raise exception 'Staff account management access required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_profile_id
  ) then
    raise exception 'Profile does not exist';
  end if;

  v_normalized := nullif(btrim(p_full_name), '');

  update public.profiles
  set full_name = v_normalized
  where id = p_profile_id;
end;
$$;

revoke execute on function public.update_staff_name(uuid, text) from public, anon;
grant execute on function public.update_staff_name(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- HR activate / deactivate
-- ------------------------------------------------------------

create or replace function public.set_staff_active_status(
  p_profile_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_target_role text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_staff_accounts()) then
    raise exception 'Staff account management access required';
  end if;

  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'Invalid account status';
  end if;

  select p.role
  into v_target_role
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    raise exception 'Profile does not exist';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner accounts cannot be deactivated through this workflow';
  end if;

  if p_profile_id = v_actor and p_status = 'inactive' then
    raise exception 'You cannot deactivate your own account';
  end if;

  update public.profiles
  set account_status = p_status
  where id = p_profile_id;
end;
$$;

revoke execute on function public.set_staff_active_status(uuid, text) from public, anon;
grant execute on function public.set_staff_active_status(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Employee ID directory search (HR + Accounts)
-- ------------------------------------------------------------

create or replace function public.search_employee_id_directory(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  employee_id text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_employee_ids()) then
    raise exception 'Employee ID management access required';
  end if;

  v_search := nullif(btrim(p_search), '');
  v_limit := greatest(coalesce(p_limit, 50), 1);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with filtered as (
    select
      sr.profile_id,
      p.full_name,
      sr.email,
      sr.employee_id
    from private.staff_registry sr
    inner join public.profiles p on p.id = sr.profile_id
    where sr.profile_id is not null
      and (
        v_search is null
        or p.full_name ilike '%' || v_search || '%'
        or sr.email ilike '%' || v_search || '%'
        or sr.employee_id = v_search
      )
  )
  select
    f.profile_id,
    f.full_name,
    f.email,
    f.employee_id,
    count(*) over () as total_count
  from filtered f
  order by f.full_name nulls last, f.email
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.search_employee_id_directory(text, integer, integer) from public, anon;
grant execute on function public.search_employee_id_directory(text, integer, integer) to authenticated;

-- ------------------------------------------------------------
-- Friendlier duplicate Employee ID errors
-- ------------------------------------------------------------

create or replace function public.set_employee_id(
  p_profile_id uuid,
  p_employee_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_email text;
  v_registry_id uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_employee_ids()) then
    raise exception 'Employee ID management access required';
  end if;

  if p_profile_id is null then
    raise exception 'Profile does not exist';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
  ) then
    raise exception 'Profile does not exist';
  end if;

  perform private.assert_valid_staff_employee_id(p_employee_id);

  select nullif(btrim(au.email::text), '')
  into v_email
  from auth.users au
  where au.id = p_profile_id;

  if v_email is null then
    raise exception 'Profile does not have a usable auth email';
  end if;

  select sr.id
  into v_registry_id
  from private.staff_registry sr
  where sr.profile_id = p_profile_id
  for update;

  perform set_config('app.employee_id_change_source', 'set_employee_id', true);

  begin
    if v_registry_id is null then
      insert into private.staff_registry (
        profile_id,
        email,
        employee_id,
        created_by,
        updated_by
      )
      values (
        p_profile_id,
        v_email,
        p_employee_id,
        v_actor,
        v_actor
      );
    else
      update private.staff_registry sr
      set
        employee_id = p_employee_id,
        updated_by = v_actor
      where sr.id = v_registry_id;
    end if;
  exception
    when unique_violation then
      if p_employee_id is not null then
        raise exception 'Employee ID % is already assigned to another user', p_employee_id;
      end if;
      raise;
  end;

  perform set_config('app.employee_id_change_source', '', true);
end;
$$;

revoke execute on function public.set_employee_id(uuid, text) from public, anon;
grant execute on function public.set_employee_id(uuid, text) to authenticated;
