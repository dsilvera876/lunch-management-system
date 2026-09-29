-- Admin/Owner temporary read-only Support Mode for HR and Accounts troubleshooting.

create table private.support_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_role text not null,
  scope text not null constraint support_sessions_scope_check check (scope in ('hr', 'accounts')),
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz null,
  ended_reason text null,
  constraint support_sessions_reason_trimmed check (char_length(btrim(reason)) > 0),
  constraint support_sessions_reason_max check (char_length(reason) <= 500)
);

create index support_sessions_actor_active_idx
  on private.support_sessions (actor_profile_id, started_at desc)
  where ended_at is null;

revoke all on table private.support_sessions from public, anon, authenticated;

-- ------------------------------------------------------------
-- Session helpers (authoritative; auth.uid() only)
-- ------------------------------------------------------------

create or replace function private.expire_stale_support_sessions(p_actor uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.support_sessions ss
  set
    ended_at = now(),
    ended_reason = coalesce(ss.ended_reason, 'expired')
  where ss.ended_at is null
    and ss.expires_at <= now()
    and (p_actor is null or ss.actor_profile_id = p_actor);
end;
$$;

revoke all on function private.expire_stale_support_sessions(uuid) from public;
grant execute on function private.expire_stale_support_sessions(uuid) to authenticated;

create or replace function private.active_support_scope()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ss.scope
  from private.support_sessions ss
  inner join public.profiles p on p.id = ss.actor_profile_id
  where ss.actor_profile_id = (select private.current_user_id())
    and ss.ended_at is null
    and ss.expires_at > now()
    and p.account_status = 'active'
    and p.role in ('admin', 'owner')
  order by ss.started_at desc
  limit 1;
$$;

revoke all on function private.active_support_scope() from public;
grant execute on function private.active_support_scope() to authenticated;

create or replace function private.has_active_support_scope(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.active_support_scope() is not null
    and private.active_support_scope() = p_scope;
$$;

revoke all on function private.has_active_support_scope(text) from public;
grant execute on function private.has_active_support_scope(text) to authenticated;

-- ------------------------------------------------------------
-- Read vs write capability helpers
-- ------------------------------------------------------------

create or replace function private.can_view_hr_operational_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr'])
    or (
      private.is_admin_or_owner()
      and private.has_active_support_scope('hr')
    );
$$;

revoke all on function private.can_view_hr_operational_data() from public;
grant execute on function private.can_view_hr_operational_data() to authenticated;

create or replace function private.can_manage_hr_operational_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr']);
$$;

revoke all on function private.can_manage_hr_operational_data() from public;
grant execute on function private.can_manage_hr_operational_data() to authenticated;

create or replace function private.can_view_accounts_operational_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts'])
    or (
      private.is_admin_or_owner()
      and private.has_active_support_scope('accounts')
    );
$$;

revoke all on function private.can_view_accounts_operational_data() from public;
grant execute on function private.can_view_accounts_operational_data() to authenticated;

create or replace function private.can_manage_accounts_operational_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts']);
$$;

revoke all on function private.can_manage_accounts_operational_data() from public;
grant execute on function private.can_manage_accounts_operational_data() to authenticated;

-- HR order visibility (read)
create or replace function private.can_view_all_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_hr_operational_data();
$$;

-- Accounts financial visibility (read)
create or replace function private.can_view_all_financial_summaries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_accounts_operational_data();
$$;

-- Lunch period mutations (Accounts only)
create or replace function private.can_manage_lunch_periods()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_accounts_operational_data();
$$;

create or replace function private.can_view_lunch_periods()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_accounts_operational_data();
$$;

revoke all on function private.can_view_lunch_periods() from public;
grant execute on function private.can_view_lunch_periods() to authenticated;

-- Provider/location operational access
create or replace function private.can_manage_lunch_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_hr_operational_data();
$$;

create or replace function private.can_view_lunch_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_hr_operational_data();
$$;

revoke all on function private.can_view_lunch_operations() from public;
grant execute on function private.can_view_lunch_operations() to authenticated;

-- Fulfillment / delivery reconciliation (HR mutations only)
create or replace function private.can_fulfill_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_hr_operational_data();
$$;

create or replace function private.can_reconcile_deliveries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_hr_operational_data();
$$;

-- Accounts payroll mutations
create or replace function private.can_finalize_lunch_periods()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_accounts_operational_data();
$$;

create or replace function private.can_export_financial_summaries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_accounts_operational_data();
$$;

create or replace function private.can_update_daily_lunch_subsidy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_accounts_operational_data();
$$;

-- Employee ID directory (read vs write)
create or replace function private.can_view_employee_id_directory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_accounts_operational_data()
    or private.can_view_hr_operational_data();
$$;

revoke all on function private.can_view_employee_id_directory() from public;
grant execute on function private.can_view_employee_id_directory() to authenticated;

create or replace function private.can_manage_employee_ids()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'accounts']);
$$;

create or replace function private.can_manage_staff_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr']);
$$;

-- ------------------------------------------------------------
-- RPC: employee directory read uses view helper
-- ------------------------------------------------------------

create or replace function public.list_employee_id_directory()
returns table (
  profile_id uuid,
  full_name text,
  email text,
  employee_id text
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

  if not (select private.can_view_employee_id_directory()) then
    raise exception 'Employee ID directory access required';
  end if;

  return query
  select
    sr.profile_id,
    p.full_name,
    sr.email,
    sr.employee_id
  from private.staff_registry sr
  inner join public.profiles p on p.id = sr.profile_id
  order by p.full_name nulls last, sr.email;
end;
$$;

-- search_staff_directory: read for HR support viewers
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

  if not (select private.can_view_hr_operational_data()) then
    raise exception 'Staff directory access required';
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

-- ------------------------------------------------------------
-- Support session RPCs
-- ------------------------------------------------------------

create or replace function public.start_support_session(
  p_scope text,
  p_reason text
)
returns table (
  scope text,
  reason text,
  started_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_reason text;
  v_expires timestamptz;
begin
  v_actor := (select private.current_user_id());
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.is_admin_or_owner()) then
    raise exception 'Admin or Owner required';
  end if;

  if p_scope is null or p_scope not in ('hr', 'accounts') then
    raise exception 'Invalid support scope';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'Support reason is required';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'Support reason is too long';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_actor
    and p.account_status = 'active';

  if v_role is null then
    raise exception 'Active profile required';
  end if;

  perform private.expire_stale_support_sessions(v_actor);

  update private.support_sessions ss
  set
    ended_at = now(),
    ended_reason = 'replaced'
  where ss.actor_profile_id = v_actor
    and ss.ended_at is null;

  v_expires := now() + interval '30 minutes';

  insert into private.support_sessions (
    actor_profile_id,
    actor_role,
    scope,
    reason,
    expires_at
  )
  values (
    v_actor,
    v_role,
    p_scope,
    v_reason,
    v_expires
  );

  return query
  select p_scope, v_reason, now(), v_expires;
end;
$$;

revoke execute on function public.start_support_session(text, text) from public, anon;
grant execute on function public.start_support_session(text, text) to authenticated;

create or replace function public.end_support_session()
returns boolean
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

  perform private.expire_stale_support_sessions(v_actor);

  update private.support_sessions ss
  set
    ended_at = now(),
    ended_reason = coalesce(ss.ended_reason, 'manual')
  where ss.actor_profile_id = v_actor
    and ss.ended_at is null
    and ss.expires_at > now();

  return found;
end;
$$;

revoke execute on function public.end_support_session() from public, anon;
grant execute on function public.end_support_session() to authenticated;

create or replace function public.get_support_session_status()
returns table (
  scope text,
  reason text,
  started_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ss.scope, ss.reason, ss.started_at, ss.expires_at
  from private.support_sessions ss
  inner join public.profiles p on p.id = ss.actor_profile_id
  where ss.actor_profile_id = (select private.current_user_id())
    and ss.ended_at is null
    and ss.expires_at > now()
    and p.account_status = 'active'
    and p.role in ('admin', 'owner')
  order by ss.started_at desc
  limit 1;
$$;

revoke execute on function public.get_support_session_status() from public, anon;
grant execute on function public.get_support_session_status() to authenticated;

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

  if not (select private.can_view_employee_id_directory()) then
    raise exception 'Employee ID directory access required';
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
