-- Make employee-name searches case-, accent-, and canonical-form-insensitive
-- without changing stored or returned display names. The combining-mark ranges
-- cover the Unicode combining diacritical mark blocks used by decomposed names;
-- punctuation remains significant.

create or replace function private.normalize_employee_name_search(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.normalize(p_value, 'NFD'),
      U&'[\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]',
      '',
      'g'
    )
  );
$$;

revoke all on function private.normalize_employee_name_search(text)
  from public, anon, authenticated;

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
  v_name_search text;
  v_limit integer;
  v_offset integer;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_hr_operational_data()) then
    raise exception 'Staff directory access required';
  end if;

  v_search := nullif(btrim(p_search), '');
  v_name_search := nullif(
    private.normalize_employee_name_search(v_search),
    ''
  );
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
        or (
          v_name_search is not null
          and private.normalize_employee_name_search(p.full_name)
            like '%' || v_name_search || '%'
        )
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
  v_name_search text;
  v_limit integer;
  v_offset integer;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_view_employee_id_directory()) then
    raise exception 'Employee ID directory access required';
  end if;

  v_search := nullif(btrim(p_search), '');
  v_name_search := nullif(
    private.normalize_employee_name_search(v_search),
    ''
  );
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
        or (
          v_name_search is not null
          and private.normalize_employee_name_search(p.full_name)
            like '%' || v_name_search || '%'
        )
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
