-- A signup request may be linked idempotently, but never reassigned to another Auth identity.
-- Recovery generation relies on this linkage as its authoritative identity boundary.

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
declare
  v_linked_profile_id uuid;
  v_request_email text;
  v_auth_email text;
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

  select sr.created_profile_id, sr.normalized_email
  into v_linked_profile_id, v_request_email
  from private.signup_requests sr
  where sr.id = p_request_id
    and sr.status = 'approved'
  for update;

  if not found then
    raise exception 'Approved signup request not found';
  end if;

  if v_linked_profile_id is not null and v_linked_profile_id <> p_profile_id then
    raise exception 'Signup request is linked to a different profile';
  end if;

  select private.normalize_signup_email(au.email::text)
  into v_auth_email
  from auth.users au
  where au.id = p_profile_id;

  if not found or v_auth_email is distinct from v_request_email then
    raise exception 'Signup request and Auth identity email mismatch';
  end if;

  update private.signup_requests sr
  set created_profile_id = p_profile_id
  where sr.id = p_request_id
    and sr.created_profile_id is null;
end;
$$;

revoke execute on function public.link_signup_request_profile(uuid, uuid, text)
  from public, anon;
grant execute on function public.link_signup_request_profile(uuid, uuid, text)
  to authenticated, service_role;
