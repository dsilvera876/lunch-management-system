-- ============================================================
-- Signup request approval / invite idempotency and recovery
-- ============================================================

-- ------------------------------------------------------------
-- Employee ID availability before account creation
-- ------------------------------------------------------------

create or replace function private.assert_signup_employee_id_available(
  p_employee_id text,
  p_ignore_profile_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_valid_staff_employee_id(p_employee_id);

  if p_employee_id is null then
    return;
  end if;

  if exists (
    select 1
    from private.staff_registry sr
    where sr.employee_id = p_employee_id
      and (p_ignore_profile_id is null or sr.profile_id is distinct from p_ignore_profile_id)
  ) then
    raise exception
      'Employee ID % is already assigned to another user',
      p_employee_id;
  end if;
end;
$$;

revoke all on function private.assert_signup_employee_id_available(text, uuid)
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Service-role profile lookup by signup email (server orchestration)
-- ------------------------------------------------------------

create or replace function public.service_lookup_profile_id_by_signup_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from auth.users au
  inner join public.profiles p on p.id = au.id
  where private.normalize_signup_email(au.email::text) = private.normalize_signup_email(p_email)
  limit 1;
$$;

revoke all on function public.service_lookup_profile_id_by_signup_email(text)
from public, anon, authenticated;
grant execute on function public.service_lookup_profile_id_by_signup_email(text) to service_role;

-- ------------------------------------------------------------
-- HR fetch single signup request
-- ------------------------------------------------------------

create or replace function public.get_signup_request(p_request_id uuid)
returns table (
  request_id uuid,
  full_name text,
  email text,
  status text,
  requested_at timestamptz,
  requested_employee_id text,
  created_profile_id uuid,
  invite_sent_at timestamptz,
  invite_last_error text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  return query
  select
    sr.id as request_id,
    sr.full_name,
    sr.email,
    sr.status,
    sr.requested_at,
    sr.requested_employee_id,
    sr.created_profile_id,
    sr.invite_sent_at,
    sr.invite_last_error
  from private.signup_requests sr
  where sr.id = p_request_id;
end;
$$;

revoke execute on function public.get_signup_request(uuid) from public, anon;
grant execute on function public.get_signup_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- Approve or resume approved signup request (idempotent)
-- ------------------------------------------------------------

drop function if exists public.mark_signup_request_approved(uuid, text);

create or replace function public.mark_signup_request_approved(
  p_request_id uuid,
  p_employee_id text default null
)
returns table (
  request_id uuid,
  email text,
  full_name text,
  normalized_email text,
  status text,
  created_profile_id uuid,
  requested_employee_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row private.signup_requests%rowtype;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  select *
  into v_row
  from private.signup_requests sr
  where sr.id = p_request_id;

  if not found then
    raise exception 'Signup request not found';
  end if;

  if v_row.status = 'rejected' then
    raise exception 'Signup request was rejected';
  end if;

  perform private.assert_valid_staff_employee_id(p_employee_id);

  perform private.assert_signup_employee_id_available(
    p_employee_id,
    v_row.created_profile_id
  );

  if v_row.status = 'pending' then
    update private.signup_requests sr
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = v_actor,
      requested_employee_id = coalesce(p_employee_id, sr.requested_employee_id),
      rejection_reason = null
    where sr.id = p_request_id
    returning * into v_row;
  elsif v_row.status = 'approved' then
    if p_employee_id is not null
       and v_row.requested_employee_id is distinct from p_employee_id then
      update private.signup_requests sr
      set requested_employee_id = p_employee_id
      where sr.id = p_request_id
      returning * into v_row;
    end if;
  end if;

  return query
  select
    v_row.id,
    v_row.email,
    v_row.full_name,
    v_row.normalized_email,
    v_row.status,
    v_row.created_profile_id,
    v_row.requested_employee_id;
end;
$$;

-- ------------------------------------------------------------
-- Include invite_last_error in directory search
-- ------------------------------------------------------------

drop function if exists public.search_signup_requests(text, text, integer, integer);

create or replace function public.search_signup_requests(
  p_search text default null,
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  request_id uuid,
  full_name text,
  email text,
  status text,
  requested_at timestamptz,
  requested_employee_id text,
  created_profile_id uuid,
  invite_sent_at timestamptz,
  invite_last_error text,
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

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  if p_status is not null and p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid status filter';
  end if;

  v_search := nullif(btrim(p_search), '');
  v_limit := greatest(coalesce(p_limit, 50), 1);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with filtered as (
    select
      sr.id as request_id,
      sr.full_name,
      sr.email,
      sr.status,
      sr.requested_at,
      sr.requested_employee_id,
      sr.created_profile_id,
      sr.invite_sent_at,
      sr.invite_last_error
    from private.signup_requests sr
    where (p_status is null or sr.status = p_status)
      and (
        v_search is null
        or sr.full_name ilike '%' || v_search || '%'
        or sr.email ilike '%' || v_search || '%'
      )
  )
  select
    f.request_id,
    f.full_name,
    f.email,
    f.status,
    f.requested_at,
    f.requested_employee_id,
    f.created_profile_id,
    f.invite_sent_at,
    f.invite_last_error,
    count(*) over () as total_count
  from filtered f
  order by f.requested_at desc, f.email
  limit v_limit
  offset v_offset;
end;
$$;

-- ------------------------------------------------------------
-- Link / invite outcome recording (idempotent link)
-- ------------------------------------------------------------

create or replace function private.sanitize_signup_invite_error(p_error text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      coalesce(nullif(btrim(p_error), ''), 'Invitation delivery failed'),
      '(password|secret|token|apikey|authorization|bearer)[=:][^\s]+',
      '\1=[redacted]',
      'gi'
    ),
    500
  );
$$;

revoke all on function private.sanitize_signup_invite_error(text)
from public, anon, authenticated;

create or replace function public.link_signup_request_profile(
  p_request_id uuid,
  p_profile_id uuid,
  p_invite_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  if p_invite_error is not null then
    update private.signup_requests sr
    set invite_last_error = private.sanitize_signup_invite_error(p_invite_error)
    where sr.id = p_request_id
      and sr.status = 'approved';

    if not found then
      raise exception 'Approved signup request not found';
    end if;

    return;
  end if;

  if p_profile_id is null then
    raise exception 'Profile id is required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
  ) then
    raise exception 'Profile does not exist';
  end if;

  update private.signup_requests sr
  set
    created_profile_id = coalesce(sr.created_profile_id, p_profile_id),
    invite_sent_at = now(),
    invite_last_error = null
  where sr.id = p_request_id
    and sr.status = 'approved'
    and (
      sr.created_profile_id is null
      or sr.created_profile_id = p_profile_id
    );

  if not found then
    raise exception 'Approved signup request not found or profile mismatch';
  end if;
end;
$$;
