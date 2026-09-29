-- Allow HR to cancel approved-incomplete signup requests that already have an Auth
-- identity (invite path) by cleaning onboarding profile + Auth before finalizing.

create or replace function private.auth_user_id_for_signup_email(p_normalized_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select au.id
  from auth.users au
  where private.normalize_signup_email(au.email::text) = p_normalized_email
  limit 1;
$$;

revoke all on function private.auth_user_id_for_signup_email(text)
  from public, anon, authenticated;

create or replace function private.remove_clean_onboarding_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = p_profile_id;

  if v_role is null then
    return;
  end if;

  if v_role = 'owner' then
    raise exception 'Owner profile cannot be deleted';
  end if;

  if (select private.user_has_business_history(p_profile_id)) then
    raise exception 'Profile with business history cannot be deleted';
  end if;

  delete from private.staff_registry sr
  where sr.profile_id = p_profile_id;

  delete from public.profiles p
  where p.id = p_profile_id;
end;
$$;

revoke all on function private.remove_clean_onboarding_profile(uuid)
  from public, anon, authenticated;

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

create or replace function public.complete_signup_request_cancellation(
  p_request_id uuid,
  p_reason text,
  p_note text default null,
  p_auth_user_id uuid default null
)
returns table (
  success boolean,
  outcome_code text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.signup_requests%rowtype;
  v_reason text;
  v_note text;
  v_auth_id uuid;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  v_reason := nullif(btrim(p_reason), '');
  v_note := nullif(btrim(p_note), '');

  select *
  into v_row
  from private.signup_requests sr
  where sr.id = p_request_id
  for update;

  if not found then
    return query select false, 'not_found'::text, 'Signup request not found.'::text;
    return;
  end if;

  if v_row.status = 'cancelled' then
    return query select true, 'already_cancelled'::text, 'Signup request is already cancelled.'::text;
    return;
  end if;

  v_auth_id := coalesce(
    p_auth_user_id,
    private.auth_user_id_for_signup_email(v_row.normalized_email)
  );

  if v_auth_id is not null
     and exists (
       select 1
       from auth.users au
       where au.id = v_auth_id
     ) then
    return query
    select
      false,
      'auth_cleanup_incomplete'::text,
      'Account setup cleanup is still in progress. Try again in a moment or contact an administrator.'::text;
    return;
  end if;

  update private.signup_requests sr
  set
    status = 'cancelled',
    cancelled_at = coalesce(sr.cancelled_at, now()),
    cancellation_reason = coalesce(v_reason, sr.cancellation_reason),
    cancellation_note = coalesce(v_note, sr.cancellation_note)
  where sr.id = p_request_id;

  return query select true, 'cancelled'::text, 'Signup request cancelled.'::text;
end;
$$;

revoke execute on function public.complete_signup_request_cancellation(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_signup_request_cancellation(uuid, text, text, uuid)
  to service_role;

drop function if exists public.cancel_signup_request(uuid, text, text);

create or replace function public.cancel_signup_request(
  p_request_id uuid,
  p_reason text,
  p_note text default null
)
returns table (
  success boolean,
  outcome_code text,
  message text,
  auth_user_id uuid,
  audit_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row private.signup_requests%rowtype;
  v_reason text;
  v_note text;
  v_auth_id uuid;
  v_auth_email text;
  v_profile_role text;
  v_audit_id uuid;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  v_reason := nullif(btrim(p_reason), '');
  v_note := nullif(btrim(p_note), '');

  if v_reason is null
     or v_reason not in (
       'incorrect_email',
       'duplicate_request',
       'no_longer_needed',
       'other'
     ) then
    return query
    select false, 'invalid_reason'::text, 'A valid cancellation reason is required.'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_row
  from private.signup_requests sr
  where sr.id = p_request_id
  for update;

  if not found then
    return query select false, 'not_found'::text, 'Signup request not found.'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_row.status = 'cancelled' then
    return query select true, 'already_cancelled'::text, 'Signup request is already cancelled.'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_row.status = 'rejected' then
    return query select false, 'not_cancellable'::text, 'Rejected signup requests cannot be cancelled.'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_row.created_profile_id is not null then
    return query
    select
      false,
      'completed'::text,
      'This signup request is already linked to a user account. Manage the account from User Management instead.'::text,
      null::uuid,
      null::uuid;
    return;
  end if;

  if v_row.status <> 'pending'
     and not (v_row.status = 'approved' and v_row.created_profile_id is null) then
    return query select false, 'not_cancellable'::text, 'This signup request cannot be cancelled.'::text, null::uuid, null::uuid;
    return;
  end if;

  perform private.cancel_email_deliveries_for_signup_request(p_request_id);

  v_auth_id := private.auth_user_id_for_signup_email(v_row.normalized_email);

  if v_auth_id is null then
    update private.signup_requests sr
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = v_reason,
      cancellation_note = v_note
    where sr.id = p_request_id;

    return query select true, 'cancelled'::text, 'Signup request cancelled.'::text, null::uuid, null::uuid;
    return;
  end if;

  select private.normalize_signup_email(au.email::text)
  into v_auth_email
  from auth.users au
  where au.id = v_auth_id;

  if v_auth_email is distinct from v_row.normalized_email then
    return query
    select
      false,
      'unrelated_auth_identity'::text,
      'An authentication record exists for this email that does not match this signup request. Contact an administrator.'::text,
      null::uuid,
      null::uuid;
    return;
  end if;

  select p.role
  into v_profile_role
  from public.profiles p
  where p.id = v_auth_id;

  if v_profile_role = 'owner' then
    return query
    select
      false,
      'completed'::text,
      'This account cannot be cancelled from signup review. Manage the Owner account from User Management instead.'::text,
      null::uuid,
      null::uuid;
    return;
  end if;

  if v_profile_role is not null
     and (select private.user_has_business_history(v_auth_id)) then
    return query
    select
      false,
      'business_history'::text,
      'This account has lunch history and cannot be removed from signup review. Deactivate the account from User Management instead.'::text,
      null::uuid,
      null::uuid;
    return;
  end if;

  begin
    perform private.remove_clean_onboarding_profile(v_auth_id);
  exception
    when others then
      if sqlerrm like 'Profile with business history cannot be deleted%' then
        return query
        select
          false,
          'business_history'::text,
          'This account has lunch history and cannot be removed from signup review. Deactivate the account from User Management instead.'::text,
          null::uuid,
          null::uuid;
        return;
      end if;
      raise;
  end;

  insert into private.user_account_deletion_audit (
    deleted_profile_id,
    normalized_email,
    previous_role,
    deleted_by,
    reason_category,
    reason_note,
    auth_delete_status
  )
  values (
    v_auth_id,
    v_row.normalized_email,
    coalesce(v_profile_role, 'staff'),
    v_actor,
    'duplicate_error',
    left(coalesce(v_note, 'Signup request cancellation'), 500),
    'pending'
  )
  on conflict (deleted_profile_id) do update
  set
    normalized_email = excluded.normalized_email,
    deleted_by = excluded.deleted_by,
    reason_note = excluded.reason_note,
    auth_delete_status = 'pending',
    auth_delete_next_attempt_at = now(),
    auth_delete_claimed_at = null
  returning id into v_audit_id;

  update private.signup_requests sr
  set
    cancellation_reason = v_reason,
    cancellation_note = v_note,
    cancelled_by = v_actor
  where sr.id = p_request_id;

  return query
  select
    false,
    'auth_cleanup_required'::text,
    'Finishing account setup cleanup before this request can be cancelled.'::text,
    v_auth_id,
    v_audit_id;
end;
$$;

revoke execute on function public.cancel_signup_request(uuid, text, text) from public, anon;
grant execute on function public.cancel_signup_request(uuid, text, text) to authenticated;
