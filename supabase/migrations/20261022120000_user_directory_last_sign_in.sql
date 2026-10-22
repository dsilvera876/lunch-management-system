-- Expose only the authoritative last successful authentication timestamp to
-- the existing authorized user directories. No other auth metadata is added.

begin;

drop function public.list_manageable_users();

create function public.list_manageable_users()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  last_sign_in_at timestamptz
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
    p.role,
    u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.full_name nulls last, u.email;
end;
$$;

alter function public.list_manageable_users() owner to postgres;
revoke all on function public.list_manageable_users() from public, anon;
grant execute on function public.list_manageable_users() to postgres, authenticated, service_role;

drop function public.search_staff_directory(text, text, text, integer, integer);

create function public.search_staff_directory(
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
  total_count bigint,
  last_sign_in_at timestamptz
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
      p.account_status as status,
      au.last_sign_in_at
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
    count(*) over () as total_count,
    f.last_sign_in_at
  from filtered f
  order by f.full_name nulls last, f.email
  limit v_limit
  offset v_offset;
end;
$$;

alter function public.search_staff_directory(text, text, text, integer, integer)
  owner to postgres;
revoke all on function public.search_staff_directory(text, text, text, integer, integer)
  from public, anon;
grant execute on function public.search_staff_directory(text, text, text, integer, integer)
  to postgres, authenticated, service_role;

commit;
