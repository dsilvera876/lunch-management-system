-- ============================================================
-- HR-controlled signup: company domains, external requests, auth hook
-- ============================================================

-- ------------------------------------------------------------
-- Company email domains (authoritative)
-- ------------------------------------------------------------

create table if not exists private.signup_email_domains (
  domain text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signup_email_domains_domain_check
    check (
      domain = lower(btrim(domain))
      and domain !~ '@'
      and length(domain) > 0
    )
);

create trigger signup_email_domains_set_updated_at
  before update on private.signup_email_domains
  for each row
  execute function private.set_updated_at();

revoke all on table private.signup_email_domains from public, anon, authenticated;

-- ------------------------------------------------------------
-- External signup requests (not application users)
-- ------------------------------------------------------------

create table if not exists private.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  full_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  requested_employee_id text
    check (
      requested_employee_id is null
      or requested_employee_id ~ '^[0-9]{4}$'
    ),
  created_profile_id uuid references public.profiles(id) on delete set null,
  invite_sent_at timestamptz,
  invite_last_error text,
  constraint signup_requests_email_trimmed check (email = btrim(email)),
  constraint signup_requests_full_name_trimmed check (full_name = btrim(full_name))
);

create unique index signup_requests_one_pending_per_email
  on private.signup_requests (normalized_email)
  where status = 'pending';

create index signup_requests_status_requested_at_idx
  on private.signup_requests (status, requested_at desc);

revoke all on table private.signup_requests from public, anon, authenticated;

-- Test fixture domain only — configure real company domains per environment.
insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do nothing;

-- ------------------------------------------------------------
-- Normalization helpers
-- ------------------------------------------------------------

create or replace function private.normalize_signup_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or btrim(p_email) = '' then null
    else lower(btrim(p_email))
  end;
$$;

revoke all on function private.normalize_signup_email(text) from public, anon, authenticated;

create or replace function private.extract_signup_email_domain(p_normalized_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_normalized_email is null then null
    when p_normalized_email !~ '^[^@]+@[^@]+$' then null
    else split_part(p_normalized_email, '@', 2)
  end;
$$;

revoke all on function private.extract_signup_email_domain(text) from public, anon, authenticated;

create or replace function private.is_active_company_signup_domain(p_domain text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.signup_email_domains sed
    where sed.domain = p_domain
      and sed.active = true
  );
$$;

revoke all on function private.is_active_company_signup_domain(text) from public, anon, authenticated;
grant execute on function private.is_active_company_signup_domain(text) to supabase_auth_admin;

create or replace function private.signup_email_has_application_account(p_normalized_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users au
    inner join public.profiles p on p.id = au.id
    where private.normalize_signup_email(au.email::text) = p_normalized_email
  );
$$;

revoke all on function private.signup_email_has_application_account(text) from public, anon, authenticated;

create or replace function private.can_manage_signup_requests()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_staff_accounts();
$$;

revoke all on function private.can_manage_signup_requests() from public;
grant execute on function private.can_manage_signup_requests() to authenticated;

-- ------------------------------------------------------------
-- Before User Created Auth Hook
-- ------------------------------------------------------------

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
  v_domain text;
begin
  v_normalized := private.normalize_signup_email(event->'user'->>'email');

  if v_normalized is null then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'A valid email address is required.',
        'http_code', 400
      )
    );
  end if;

  if private.signup_email_has_application_account(v_normalized) then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'An account with this email already exists.',
        'http_code', 403
      )
    );
  end if;

  v_domain := private.extract_signup_email_domain(v_normalized);

  if v_domain is not null
     and private.is_active_company_signup_domain(v_domain) then
    return '{}'::jsonb;
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'approved'
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'message', 'Signup is not permitted for this email address.',
      'http_code', 403
    )
  );
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ------------------------------------------------------------
-- Signup classification + external request (anon-safe)
-- ------------------------------------------------------------

create or replace function public.classify_signup_email(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_normalized text;
  v_domain text;
begin
  v_normalized := private.normalize_signup_email(p_email);

  if v_normalized is null
     or v_normalized !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  v_domain := private.extract_signup_email_domain(v_normalized);

  if v_domain is not null
     and private.is_active_company_signup_domain(v_domain) then
    return jsonb_build_object('ok', true, 'path', 'company');
  end if;

  return jsonb_build_object('ok', true, 'path', 'external');
end;
$$;

revoke execute on function public.classify_signup_email(text) from authenticated;
grant execute on function public.classify_signup_email(text) to anon;

create or replace function public.request_external_signup(
  p_full_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_normalized text;
  v_domain text;
  v_request_id uuid;
begin
  v_name := nullif(btrim(p_full_name), '');
  v_normalized := private.normalize_signup_email(p_email);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

  if v_normalized is null
     or v_normalized !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  v_domain := private.extract_signup_email_domain(v_normalized);

  if v_domain is not null
     and private.is_active_company_signup_domain(v_domain) then
    return jsonb_build_object('ok', false, 'code', 'company_email');
  end if;

  if private.signup_email_has_application_account(v_normalized) then
    return jsonb_build_object(
      'ok', false,
      'code', 'unavailable',
      'message', 'This email address cannot be used for a new access request.'
    );
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'pending'
  ) then
    return jsonb_build_object('ok', true, 'code', 'already_pending');
  end if;

  if exists (
    select 1
    from private.signup_requests sr
    where sr.normalized_email = v_normalized
      and sr.status = 'approved'
      and sr.created_profile_id is null
  ) then
    return jsonb_build_object('ok', true, 'code', 'already_approved');
  end if;

  insert into private.signup_requests (
    email,
    normalized_email,
    full_name,
    status
  )
  values (
    v_normalized,
    v_normalized,
    v_name,
    'pending'
  )
  returning id into v_request_id;

  return jsonb_build_object('ok', true, 'code', 'submitted', 'request_id', v_request_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'code', 'already_pending');
end;
$$;

revoke execute on function public.request_external_signup(text, text) from authenticated;
grant execute on function public.request_external_signup(text, text) to anon;

-- ------------------------------------------------------------
-- HR signup request management
-- ------------------------------------------------------------

create or replace function public.count_pending_signup_requests()
returns bigint
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

  return (
    select count(*)::bigint
    from private.signup_requests sr
    where sr.status = 'pending'
  );
end;
$$;

revoke execute on function public.count_pending_signup_requests() from public, anon;
grant execute on function public.count_pending_signup_requests() to authenticated;

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
      sr.invite_sent_at
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
    count(*) over () as total_count
  from filtered f
  order by f.requested_at desc, f.email
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.search_signup_requests(text, text, integer, integer)
from public, anon;
grant execute on function public.search_signup_requests(text, text, integer, integer)
to authenticated;

create or replace function public.reject_signup_request(
  p_request_id uuid,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  update private.signup_requests sr
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = v_actor,
    rejection_reason = nullif(btrim(p_rejection_reason), '')
  where sr.id = p_request_id
    and sr.status = 'pending';

  if not found then
    raise exception 'Signup request is not pending';
  end if;
end;
$$;

revoke execute on function public.reject_signup_request(uuid, text) from public, anon;
grant execute on function public.reject_signup_request(uuid, text) to authenticated;

create or replace function public.mark_signup_request_approved(
  p_request_id uuid,
  p_employee_id text default null
)
returns table (
  request_id uuid,
  email text,
  full_name text,
  normalized_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_updated_count integer;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  perform private.assert_valid_staff_employee_id(p_employee_id);

  return query
  with updated as (
    update private.signup_requests sr
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = v_actor,
      requested_employee_id = p_employee_id,
      rejection_reason = null
    where sr.id = p_request_id
      and sr.status = 'pending'
    returning sr.id, sr.email, sr.full_name, sr.normalized_email
  )
  select
    u.id,
    u.email,
    u.full_name,
    u.normalized_email
  from updated u;

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    raise exception 'Signup request is not pending';
  end if;
end;
$$;

revoke execute on function public.mark_signup_request_approved(uuid, text) from public, anon;
grant execute on function public.mark_signup_request_approved(uuid, text) to authenticated;

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
    set invite_last_error = left(btrim(p_invite_error), 500)
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

  update private.signup_requests sr
  set
    created_profile_id = p_profile_id,
    invite_sent_at = coalesce(sr.invite_sent_at, now()),
    invite_last_error = null
  where sr.id = p_request_id
    and sr.status = 'approved';

  if not found then
    raise exception 'Approved signup request not found';
  end if;
end;
$$;

revoke execute on function public.link_signup_request_profile(uuid, uuid, text) from public, anon;
grant execute on function public.link_signup_request_profile(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Profile creation: always staff / active; ignore metadata role
-- ------------------------------------------------------------

create or replace function private.force_staff_profile_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.role := 'staff';
  new.account_status := coalesce(new.account_status, 'active');
  return new;
end;
$$;

drop trigger if exists force_staff_profile_on_insert on public.profiles;

create trigger force_staff_profile_on_insert
  before insert on public.profiles
  for each row
  execute function private.force_staff_profile_on_insert();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, account_status)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    'staff',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
