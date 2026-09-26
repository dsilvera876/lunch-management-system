-- ============================================================
-- Phase 1: confidential Employee IDs (HR + Accounts only)
-- ============================================================

-- ------------------------------------------------------------
-- Registry + audit tables (private schema)
-- ------------------------------------------------------------

create table private.staff_registry (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  email text not null,
  employee_id text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint staff_registry_employee_id_format_check
    check (employee_id is null or employee_id ~ '^[0-9]{4}$')
);

create unique index staff_registry_employee_id_unique_idx
  on private.staff_registry (employee_id)
  where employee_id is not null;

create unique index staff_registry_email_unique_idx
  on private.staff_registry (lower(btrim(email)));

create table private.employee_id_audit (
  id uuid primary key default gen_random_uuid(),
  staff_registry_id uuid not null references private.staff_registry(id) on delete cascade,
  old_employee_id text,
  new_employee_id text,
  changed_by uuid references public.profiles(id) on delete set null,
  source text not null,
  changed_at timestamptz not null default now()
);

create trigger staff_registry_set_updated_at
  before update on private.staff_registry
  for each row
  execute function private.set_updated_at();

create or replace function private.audit_staff_registry_employee_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.employee_id is distinct from old.employee_id then
      insert into private.employee_id_audit (
        staff_registry_id,
        old_employee_id,
        new_employee_id,
        changed_by,
        source
      )
      values (
        new.id,
        old.employee_id,
        new.employee_id,
        new.updated_by,
        coalesce(
          nullif(current_setting('app.employee_id_change_source', true), ''),
          'staff_registry_update'
        )
      );
    end if;
  elsif tg_op = 'INSERT' and new.employee_id is not null then
    insert into private.employee_id_audit (
      staff_registry_id,
      old_employee_id,
      new_employee_id,
      changed_by,
      source
    )
    values (
      new.id,
      null,
      new.employee_id,
      new.created_by,
      coalesce(
        nullif(current_setting('app.employee_id_change_source', true), ''),
        'staff_registry_insert'
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.audit_staff_registry_employee_id() from public, anon, authenticated;

create trigger staff_registry_audit_employee_id
  after insert or update of employee_id on private.staff_registry
  for each row
  execute function private.audit_staff_registry_employee_id();

alter table private.staff_registry enable row level security;
alter table private.staff_registry force row level security;

alter table private.employee_id_audit enable row level security;
alter table private.employee_id_audit force row level security;

revoke all on table private.staff_registry from public, anon, authenticated;
revoke all on table private.employee_id_audit from public, anon, authenticated;

-- ------------------------------------------------------------
-- Backfill registry rows for existing application profiles
-- ------------------------------------------------------------

insert into private.staff_registry (profile_id, email, employee_id)
select
  p.id,
  btrim(au.email::text),
  null
from public.profiles p
inner join auth.users au on au.id = p.id
where nullif(btrim(au.email::text), '') is not null;

do $$
begin
  if exists (
    select 1
    from public.profiles p
    inner join auth.users au on au.id = p.id
    where nullif(btrim(au.email::text), '') is null
  ) then
    raise exception
      'staff_registry backfill blocked: one or more profiles lack a usable auth email';
  end if;

  if exists (
    select 1
    from public.profiles p
    where not exists (
      select 1
      from private.staff_registry sr
      where sr.profile_id = p.id
    )
  ) then
    raise exception 'staff_registry backfill incomplete for existing profiles';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Authorization helper
-- ------------------------------------------------------------

create or replace function private.can_manage_employee_ids()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'accounts']);
$$;

revoke all on function private.can_manage_employee_ids() from public;
grant execute on function private.can_manage_employee_ids() to authenticated;

-- ------------------------------------------------------------
-- Employee ID validation helper (strict, no trimming)
-- ------------------------------------------------------------

create or replace function private.assert_valid_staff_employee_id(p_employee_id text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_employee_id is null then
    return;
  end if;

  if p_employee_id !~ '^[0-9]{4}$' then
    raise exception 'Invalid employee ID format';
  end if;
end;
$$;

revoke all on function private.assert_valid_staff_employee_id(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Directory RPC (HR / Accounts only)
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

  if not (select private.can_manage_employee_ids()) then
    raise exception 'Employee ID management access required';
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

revoke execute on function public.list_employee_id_directory() from public, anon;
grant execute on function public.list_employee_id_directory() to authenticated;

-- ------------------------------------------------------------
-- Set / clear Employee ID
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

  perform set_config('app.employee_id_change_source', '', true);
end;
$$;

revoke execute on function public.set_employee_id(uuid, text) from public, anon;
grant execute on function public.set_employee_id(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Financial export including confidential four-digit Employee IDs
-- Requires BOTH employee-id access and financial export access.
-- ------------------------------------------------------------

create or replace function public.get_lunch_period_employee_id_export_data(p_period_id uuid)
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

  if not (select private.can_manage_employee_ids()) then
    raise exception 'Employee ID management access required';
  end if;

  if not (select private.can_export_financial_summaries()) then
    raise exception 'Financial export access required';
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
        'profile_id', e.profile_id,
        'employee_id', sr.employee_id,
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
  ) e
  left join private.staff_registry sr on sr.profile_id = e.profile_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_id', q.order_id,
      'profile_id', q.profile_id,
      'employee_id', sr.employee_id,
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
  ) q
  left join private.staff_registry sr on sr.profile_id = q.profile_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'profile_id', d.profile_id,
      'employee_id', sr.employee_id,
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
  join auth.users au on au.id = pr.id
  left join private.staff_registry sr on sr.profile_id = d.profile_id;

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

revoke execute on function public.get_lunch_period_employee_id_export_data(uuid) from public, anon;
grant execute on function public.get_lunch_period_employee_id_export_data(uuid) to authenticated;
