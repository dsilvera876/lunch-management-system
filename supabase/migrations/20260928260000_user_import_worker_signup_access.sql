-- Bulk import worker runs as service_role without an HR JWT. Signup orchestration
-- RPCs must allow the worker service caller.

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
  if not (select private.is_worker_service_caller()) then
    if (select private.current_user_id()) is null then
      raise exception 'Authentication required';
    end if;

    if not (select private.can_manage_signup_requests()) then
      raise exception 'Signup request management access required';
    end if;
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
grant execute on function public.get_signup_request(uuid) to service_role;

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
  if not (select private.is_worker_service_caller()) then
    if (select private.current_user_id()) is null then
      raise exception 'Authentication required';
    end if;

    if not (select private.can_manage_signup_requests()) then
      raise exception 'Signup request management access required';
    end if;
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
  set created_profile_id = coalesce(sr.created_profile_id, p_profile_id)
  where sr.id = p_request_id
    and sr.status = 'approved';

  if not found then
    raise exception 'Approved signup request not found';
  end if;
end;
$$;

revoke execute on function public.link_signup_request_profile(uuid, uuid, text) from public, anon;
grant execute on function public.link_signup_request_profile(uuid, uuid, text) to authenticated;
grant execute on function public.link_signup_request_profile(uuid, uuid, text) to service_role;

create or replace function public.service_apply_user_import_profile_update(
  p_import_row_id uuid,
  p_full_name text,
  p_employee_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.user_import_rows%rowtype;
  v_name text;
  v_email text;
  v_registry_id uuid;
  v_target_profile_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_row
  from private.user_import_rows r
  where r.id = p_import_row_id
  for update;

  if not found or v_row.status <> 'processing' then
    raise exception 'Import row is not processing';
  end if;

  v_target_profile_id := v_row.profile_id;

  if v_target_profile_id is null then
    select l.profile_id
    into v_target_profile_id
    from private.lookup_user_import_profile(v_row.normalized_email) l;
  end if;

  if v_target_profile_id is null then
    select public.service_lookup_profile_id_by_signup_email(v_row.email)
    into v_target_profile_id;
  end if;

  if v_target_profile_id is null then
    raise exception 'Import row has no profile reference';
  end if;

  if v_row.profile_id is distinct from v_target_profile_id then
    update private.user_import_rows r
    set profile_id = v_target_profile_id
    where r.id = p_import_row_id;
  end if;

  v_name := nullif(btrim(p_full_name), '');

  if v_name is not null then
    update public.profiles p
    set full_name = v_name
    where p.id = v_target_profile_id;
  end if;

  if p_employee_id is not null then
    perform private.assert_valid_staff_employee_id(p_employee_id);
    perform private.assert_signup_employee_id_available(p_employee_id, v_target_profile_id);

    select nullif(btrim(au.email::text), '')
    into v_email
    from auth.users au
    where au.id = v_target_profile_id;

    select sr.id
    into v_registry_id
    from private.staff_registry sr
    where sr.profile_id = v_target_profile_id
    for update;

    perform set_config('app.employee_id_change_source', 'bulk_user_import', true);

    if v_registry_id is null then
      insert into private.staff_registry (profile_id, email, employee_id)
      values (v_target_profile_id, v_email, p_employee_id);
    else
      update private.staff_registry sr
      set employee_id = p_employee_id
      where sr.id = v_registry_id;
    end if;
  end if;

  return v_target_profile_id;
end;
$$;

revoke execute on function public.service_apply_user_import_profile_update(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_apply_user_import_profile_update(uuid, text, text) to service_role;
