-- Append-only audit trail for profile role changes and Owner transfers.
--
-- Every role change must pass private.apply_profile_role (the trusted role-change
-- gate enforced by guard_profile_role_change). An AFTER UPDATE trigger on
-- public.profiles records each change in the same transaction, so failed or
-- rolled-back mutations never leave audit rows. RPCs label the change through
-- private.apply_audited_profile_role; unlabeled privileged changes (seeds,
-- maintenance) are recorded as 'system_role_change'.

-- ------------------------------------------------------------
-- 1. Audit table
-- ------------------------------------------------------------

-- Profile ids are intentionally not foreign keys so audit history survives
-- permanent account deletion and is never rewritten by ON DELETE actions.
create table private.profile_role_change_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null
    constraint profile_role_change_audit_action_check
    check (action in (
      'role_assignment',
      'ownership_transfer',
      'owner_bootstrap',
      'system_role_change'
    )),
  actor_profile_id uuid,
  target_profile_id uuid not null,
  previous_role text not null
    constraint profile_role_change_audit_previous_role_check
    check (previous_role in ('staff', 'hr', 'accounts', 'admin', 'owner')),
  new_role text not null
    constraint profile_role_change_audit_new_role_check
    check (new_role in ('staff', 'hr', 'accounts', 'admin', 'owner')),
  ownership_transfer_id uuid,
  previous_owner_id uuid,
  new_owner_id uuid,
  created_at timestamptz not null default now(),
  constraint profile_role_change_audit_role_changed
    check (previous_role <> new_role),
  constraint profile_role_change_audit_actor_required
    check (action not in ('role_assignment', 'ownership_transfer') or actor_profile_id is not null),
  constraint profile_role_change_audit_transfer_details
    check (
      case
        when action = 'ownership_transfer' then
          ownership_transfer_id is not null
          and previous_owner_id is not null
          and new_owner_id is not null
        else
          ownership_transfer_id is null
          and previous_owner_id is null
          and new_owner_id is null
      end
    )
);

create index profile_role_change_audit_target_idx
  on private.profile_role_change_audit (target_profile_id, created_at desc);

create index profile_role_change_audit_created_at_idx
  on private.profile_role_change_audit (created_at desc);

create index profile_role_change_audit_transfer_idx
  on private.profile_role_change_audit (ownership_transfer_id)
  where ownership_transfer_id is not null;

alter table private.profile_role_change_audit enable row level security;

revoke all on table private.profile_role_change_audit
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Append-only enforcement (applies to every role, including the owner)
-- ------------------------------------------------------------

create or replace function private.prevent_profile_role_change_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Role change audit records are append-only';
end;
$$;

revoke all on function private.prevent_profile_role_change_audit_mutation()
  from public, anon, authenticated, service_role;

create trigger prevent_profile_role_change_audit_update_delete
  before update or delete on private.profile_role_change_audit
  for each row
  execute function private.prevent_profile_role_change_audit_mutation();

create trigger prevent_profile_role_change_audit_truncate
  before truncate on private.profile_role_change_audit
  for each statement
  execute function private.prevent_profile_role_change_audit_mutation();

-- ------------------------------------------------------------
-- 3. Recording trigger on profiles
-- ------------------------------------------------------------

create or replace function private.audit_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.profile_role_change_audit (
    action,
    actor_profile_id,
    target_profile_id,
    previous_role,
    new_role,
    ownership_transfer_id,
    previous_owner_id,
    new_owner_id
  )
  values (
    coalesce(
      nullif(current_setting('app.role_change_audit_action', true), ''),
      'system_role_change'
    ),
    (select private.current_user_id()),
    new.id,
    old.role,
    new.role,
    nullif(current_setting('app.role_change_audit_transfer_id', true), '')::uuid,
    nullif(current_setting('app.role_change_audit_previous_owner_id', true), '')::uuid,
    nullif(current_setting('app.role_change_audit_new_owner_id', true), '')::uuid
  );

  return null;
end;
$$;

revoke all on function private.audit_profile_role_change()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_profile_role_change on public.profiles;

create trigger audit_profile_role_change
  after update of role on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function private.audit_profile_role_change();

-- ------------------------------------------------------------
-- 4. Labeled role-change helper for RPCs
-- ------------------------------------------------------------

create or replace function private.apply_audited_profile_role(
  p_profile_id uuid,
  p_new_role text,
  p_action text,
  p_ownership_transfer_id uuid default null,
  p_previous_owner_id uuid default null,
  p_new_owner_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action is null or p_action not in ('role_assignment', 'ownership_transfer', 'owner_bootstrap') then
    raise exception 'Invalid role change audit action';
  end if;

  perform set_config('app.role_change_audit_action', p_action, true);
  perform set_config(
    'app.role_change_audit_transfer_id',
    coalesce(p_ownership_transfer_id::text, ''),
    true
  );
  perform set_config(
    'app.role_change_audit_previous_owner_id',
    coalesce(p_previous_owner_id::text, ''),
    true
  );
  perform set_config(
    'app.role_change_audit_new_owner_id',
    coalesce(p_new_owner_id::text, ''),
    true
  );

  perform private.apply_profile_role(p_profile_id, p_new_role);

  perform set_config('app.role_change_audit_action', '', true);
  perform set_config('app.role_change_audit_transfer_id', '', true);
  perform set_config('app.role_change_audit_previous_owner_id', '', true);
  perform set_config('app.role_change_audit_new_owner_id', '', true);
end;
$$;

revoke all on function private.apply_audited_profile_role(uuid, text, text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Role mutation RPCs: audited, never in Support Mode
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

  if (select private.active_support_scope()) is not null then
    raise exception 'Role management is unavailable in Support Mode';
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

  perform private.apply_audited_profile_role(p_profile_id, p_role, 'role_assignment');
end;
$$;

revoke execute on function public.assign_user_role(uuid, text) from public, anon;
grant execute on function public.assign_user_role(uuid, text) to authenticated;

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
  v_transfer_id uuid;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if (select private.active_support_scope()) is not null then
    raise exception 'Ownership transfer is unavailable in Support Mode';
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

  v_transfer_id := gen_random_uuid();

  perform private.apply_audited_profile_role(
    v_current_owner_id, 'admin', 'ownership_transfer',
    v_transfer_id, v_current_owner_id, p_new_owner_id
  );
  perform private.apply_audited_profile_role(
    p_new_owner_id, 'owner', 'ownership_transfer',
    v_transfer_id, v_current_owner_id, p_new_owner_id
  );
end;
$$;

revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;

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

  perform private.apply_audited_profile_role(p_profile_id, 'owner', 'owner_bootstrap');
end;
$$;

revoke all on function public.bootstrap_first_owner(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_owner(uuid) to postgres, service_role;

-- ------------------------------------------------------------
-- 6. Read access: Admin/Owner only, outside Support Mode, ids only
-- ------------------------------------------------------------

create or replace function public.list_profile_role_change_audit(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  action text,
  actor_profile_id uuid,
  target_profile_id uuid,
  previous_role text,
  new_role text,
  ownership_transfer_id uuid,
  previous_owner_id uuid,
  new_owner_id uuid,
  created_at timestamptz,
  total_count bigint
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

  if (select private.active_support_scope()) is not null then
    raise exception 'Role change audit is unavailable in Support Mode';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role change audit access required';
  end if;

  return query
  select
    a.id,
    a.action,
    a.actor_profile_id,
    a.target_profile_id,
    a.previous_role,
    a.new_role,
    a.ownership_transfer_id,
    a.previous_owner_id,
    a.new_owner_id,
    a.created_at,
    count(*) over () as total_count
  from private.profile_role_change_audit a
  order by a.created_at desc, a.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.list_profile_role_change_audit(integer, integer) from public, anon;
grant execute on function public.list_profile_role_change_audit(integer, integer) to authenticated;
