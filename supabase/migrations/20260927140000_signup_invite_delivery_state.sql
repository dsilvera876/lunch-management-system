-- Separate profile linking from invite delivery timestamps.

create or replace function public.record_signup_invite_delivered(p_request_id uuid)
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

  update private.signup_requests sr
  set
    invite_sent_at = now(),
    invite_last_error = null
  where sr.id = p_request_id
    and sr.status = 'approved';

  if not found then
    raise exception 'Approved signup request not found';
  end if;
end;
$$;

revoke execute on function public.record_signup_invite_delivered(uuid) from public, anon;
grant execute on function public.record_signup_invite_delivered(uuid) to authenticated;

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
  set created_profile_id = coalesce(sr.created_profile_id, p_profile_id)
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
