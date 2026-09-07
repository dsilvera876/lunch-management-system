-- ============================================================
-- Lunch periods (Batch 2A)
-- Configurable payroll-aligned periods with explicit current flag
-- ============================================================

create table public.lunch_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null
    check (length(trim(label)) > 0),
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_by uuid
    references public.profiles(id) on delete set null,
  updated_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lunch_periods_date_range
    check (start_date <= end_date)
);

create unique index lunch_periods_single_current_idx
  on public.lunch_periods (is_current)
  where is_current = true;

create index idx_lunch_periods_end_date
  on public.lunch_periods (end_date desc);

create index idx_lunch_periods_start_date
  on public.lunch_periods (start_date desc);

create trigger lunch_periods_set_updated_at
  before update on public.lunch_periods
  for each row execute function private.set_updated_at();


-- ------------------------------------------------------------
-- Trusted write guard (mutations only via SECURITY DEFINER RPCs)
-- ------------------------------------------------------------

create or replace function private.guard_lunch_period_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.allow_lunch_period_write', true) is distinct from 'true' then
    raise exception 'Lunch period changes must use the dedicated lunch period functions';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_lunch_period_write
  before insert or update or delete on public.lunch_periods
  for each row
  execute function private.guard_lunch_period_write();


-- ------------------------------------------------------------
-- Current-period guard (changes only via set_current_lunch_period)
-- ------------------------------------------------------------

create or replace function private.guard_lunch_period_current_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.is_current then
    if current_setting('app.allow_lunch_period_current_change', true) is distinct from 'true' then
      raise exception 'Use set_current_lunch_period to mark a period as current';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.is_current is distinct from old.is_current then
    if current_setting('app.allow_lunch_period_current_change', true) is distinct from 'true' then
      raise exception 'Use set_current_lunch_period to change the current period';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_lunch_period_current_change
  before insert or update on public.lunch_periods
  for each row
  execute function private.guard_lunch_period_current_change();


-- ------------------------------------------------------------
-- Authorization helper
-- ------------------------------------------------------------

create or replace function private.can_manage_lunch_periods()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_manage_lunch_periods() from public;
grant execute on function private.can_manage_lunch_periods() to authenticated;


-- ------------------------------------------------------------
-- Order-date membership helpers (accounting uses order date)
-- ------------------------------------------------------------

create or replace function public.lunch_period_contains_order_date(
  p_start_date date,
  p_end_date date,
  p_order_date date
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_order_date between p_start_date and p_end_date;
$$;

revoke all on function public.lunch_period_contains_order_date(date, date, date) from public;
grant execute on function public.lunch_period_contains_order_date(date, date, date) to authenticated;

create or replace function public.find_lunch_period_id_for_order_date(
  p_order_date date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.lunch_periods
  where p_order_date between start_date and end_date
  order by start_date
  limit 1;
$$;

revoke all on function public.find_lunch_period_id_for_order_date(date) from public;
grant execute on function public.find_lunch_period_id_for_order_date(date) to authenticated;


-- ------------------------------------------------------------
-- Row Level Security (read-only for authenticated clients)
-- ------------------------------------------------------------

alter table public.lunch_periods enable row level security;

revoke all on public.lunch_periods from anon, authenticated;
grant select on public.lunch_periods to authenticated;

create policy "Authenticated users can view lunch periods"
on public.lunch_periods
for select
to authenticated
using (true);


-- ------------------------------------------------------------
-- Create first lunch period
-- ------------------------------------------------------------

create or replace function public.create_first_lunch_period(
  p_label text,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if exists (select 1 from public.lunch_periods) then
    raise exception 'Use create_next_lunch_period when periods already exist';
  end if;

  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'Label is required';
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Invalid date range';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.lunch_periods'));

  perform set_config('app.allow_lunch_period_write', 'true', true);

  insert into public.lunch_periods (
    label,
    start_date,
    end_date,
    created_by,
    updated_by
  )
  values (
    trim(p_label),
    p_start_date,
    p_end_date,
    (select private.current_user_id()),
    (select private.current_user_id())
  )
  returning id into v_period_id;

  perform set_config('app.allow_lunch_period_write', 'false', true);

  return v_period_id;
end;
$$;

revoke execute on function public.create_first_lunch_period(text, date, date) from public, anon;
grant execute on function public.create_first_lunch_period(text, date, date) to authenticated;


-- ------------------------------------------------------------
-- Append next contiguous lunch period
-- ------------------------------------------------------------

create or replace function public.create_next_lunch_period(
  p_label text,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_end date;
  v_start_date date;
  v_period_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'Label is required';
  end if;

  if p_end_date is null then
    raise exception 'End date is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.lunch_periods'));

  select end_date
  into v_latest_end
  from public.lunch_periods
  order by end_date desc
  limit 1
  for update;

  if not found then
    raise exception 'Use create_first_lunch_period for the first period';
  end if;

  v_start_date := v_latest_end + 1;

  if p_end_date < v_start_date then
    raise exception 'End date must be on or after the derived start date';
  end if;

  perform set_config('app.allow_lunch_period_write', 'true', true);

  insert into public.lunch_periods (
    label,
    start_date,
    end_date,
    created_by,
    updated_by
  )
  values (
    trim(p_label),
    v_start_date,
    p_end_date,
    (select private.current_user_id()),
    (select private.current_user_id())
  )
  returning id into v_period_id;

  perform set_config('app.allow_lunch_period_write', 'false', true);

  return v_period_id;
end;
$$;

revoke execute on function public.create_next_lunch_period(text, date) from public, anon;
grant execute on function public.create_next_lunch_period(text, date) to authenticated;


-- ------------------------------------------------------------
-- Label updates (dates remain locked for non-latest periods)
-- ------------------------------------------------------------

create or replace function public.update_lunch_period_label(
  p_period_id uuid,
  p_label text
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

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if p_label is null or length(trim(p_label)) = 0 then
    raise exception 'Label is required';
  end if;

  if not exists (
    select 1
    from public.lunch_periods
    where id = p_period_id
  ) then
    raise exception 'Lunch period does not exist';
  end if;

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    label = trim(p_label),
    updated_by = (select private.current_user_id())
  where id = p_period_id;

  perform set_config('app.allow_lunch_period_write', 'false', true);
end;
$$;

revoke execute on function public.update_lunch_period_label(uuid, text) from public, anon;
grant execute on function public.update_lunch_period_label(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- Latest period end-date adjustment
-- ------------------------------------------------------------

create or replace function public.update_latest_lunch_period_end_date(
  p_period_id uuid,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start_date date;
  v_latest_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if p_end_date is null then
    raise exception 'End date is required';
  end if;

  select id
  into v_latest_id
  from public.lunch_periods
  order by end_date desc
  limit 1
  for update;

  if v_latest_id is distinct from p_period_id then
    raise exception 'Only the latest lunch period end date may be adjusted';
  end if;

  select start_date
  into v_start_date
  from public.lunch_periods
  where id = p_period_id;

  if p_end_date < v_start_date then
    raise exception 'End date must be on or after the period start date';
  end if;

  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    end_date = p_end_date,
    updated_by = (select private.current_user_id())
  where id = p_period_id;

  perform set_config('app.allow_lunch_period_write', 'false', true);
end;
$$;

revoke execute on function public.update_latest_lunch_period_end_date(uuid, date) from public, anon;
grant execute on function public.update_latest_lunch_period_end_date(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- Set current lunch period (atomic)
-- ------------------------------------------------------------

create or replace function public.set_current_lunch_period(
  p_period_id uuid
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

  if not (select private.can_manage_lunch_periods()) then
    raise exception 'Lunch period management access required';
  end if;

  if not exists (
    select 1
    from public.lunch_periods
    where id = p_period_id
  ) then
    raise exception 'Lunch period does not exist';
  end if;

  perform set_config('app.allow_lunch_period_current_change', 'true', true);
  perform set_config('app.allow_lunch_period_write', 'true', true);

  update public.lunch_periods
  set
    is_current = false,
    updated_by = (select private.current_user_id())
  where is_current = true;

  update public.lunch_periods
  set
    is_current = true,
    updated_by = (select private.current_user_id())
  where id = p_period_id;

  perform set_config('app.allow_lunch_period_current_change', 'false', true);
  perform set_config('app.allow_lunch_period_write', 'false', true);
end;
$$;

revoke execute on function public.set_current_lunch_period(uuid) from public, anon;
grant execute on function public.set_current_lunch_period(uuid) to authenticated;
