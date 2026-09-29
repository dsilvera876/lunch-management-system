-- Application-owned signup onboarding completion (not Auth email/sign-in timestamps).

alter table private.signup_requests
  add column if not exists onboarding_completed_at timestamptz;

comment on column private.signup_requests.onboarding_completed_at is
  'Set when the invited user completes account setup via complete_signup_onboarding().';

-- Safe backfill: only established application activity (never Auth invite/OTP timestamps).
create or replace function private.signup_onboarding_backfill_eligible(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null
    and private.user_has_business_history(p_profile_id);
$$;

revoke all on function private.signup_onboarding_backfill_eligible(uuid)
  from public, anon, authenticated;

update private.signup_requests sr
set onboarding_completed_at = coalesce(sr.reviewed_at, sr.requested_at, now())
where sr.status = 'approved'
  and sr.created_profile_id is not null
  and sr.onboarding_completed_at is null
  and private.signup_onboarding_backfill_eligible(sr.created_profile_id);

create or replace function private.signup_onboarding_pending_for_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.signup_requests sr
    where sr.created_profile_id = p_profile_id
      and sr.status = 'approved'
      and sr.onboarding_completed_at is null
  );
$$;

revoke all on function private.signup_onboarding_pending_for_profile(uuid)
  from public, anon, authenticated;

create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select case
      when nullif(current_setting('request.jwt.claims', true), '') is not null then
        (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
      else
        (select auth.uid())
    end as id
  )
  select a.id
  from actor a
  inner join public.profiles p
    on p.id = a.id
   and p.account_status = 'active'
  where a.id is not null
    and not private.signup_onboarding_pending_for_profile(a.id);
$$;

create or replace function public.complete_signup_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_row private.signup_requests%rowtype;
begin
  v_uid := (select auth.uid());

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_row
  from private.signup_requests sr
  where sr.created_profile_id = v_uid
    and sr.status = 'approved'
  order by sr.requested_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'code', 'no_signup_request',
      'message', 'No approved signup request is linked to this account.'
    );
  end if;

  if v_row.onboarding_completed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_completed',
      'message', 'Account setup is already complete.'
    );
  end if;

  update private.signup_requests sr
  set onboarding_completed_at = now()
  where sr.id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'message', 'Account setup completed.'
  );
end;
$$;

revoke execute on function public.complete_signup_onboarding() from public, anon;
grant execute on function public.complete_signup_onboarding() to authenticated;

drop function if exists private.signup_auth_onboarding_established(uuid);

create or replace function private.signup_linked_profile_cancellation_block(
  p_profile_id uuid
)
returns table (
  outcome_code text,
  message text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_account_status text;
  v_onboarding_completed timestamptz;
begin
  if p_profile_id is null then
    return;
  end if;

  select p.role, p.account_status
  into v_role, v_account_status
  from public.profiles p
  where p.id = p_profile_id;

  if v_role is null then
    return;
  end if;

  if v_account_status = 'inactive' then
    return query
    select
      'not_cancellable'::text,
      'This inactive account must be managed from User Management.'::text;
    return;
  end if;

  if v_role in ('owner', 'admin', 'accounts', 'hr') then
    return query
    select
      'completed'::text,
      format(
        'This %s account cannot be cancelled from signup review. Manage the account from User Management instead.',
        v_role
      );
    return;
  end if;

  select sr.onboarding_completed_at
  into v_onboarding_completed
  from private.signup_requests sr
  where sr.created_profile_id = p_profile_id
    and sr.status = 'approved'
  order by sr.requested_at desc
  limit 1;

  if v_onboarding_completed is not null then
    return query
    select
      'completed'::text,
      'This user has already completed account setup. Manage the account from Users.'::text;
    return;
  end if;

  if private.user_has_business_history(p_profile_id) then
    return query
    select
      'business_history'::text,
      'This account has lunch history and cannot be removed from signup review. Deactivate the account from User Management instead.'::text;
    return;
  end if;
end;
$$;

revoke all on function private.signup_linked_profile_cancellation_block(uuid)
  from public, anon, authenticated;

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
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_note text,
  onboarding_established boolean,
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

  if p_status is not null
     and p_status not in ('pending', 'approved', 'rejected', 'cancelled') then
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
      sr.invite_last_error,
      sr.cancelled_at,
      sr.cancellation_reason,
      sr.cancellation_note,
      sr.onboarding_completed_at
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
    f.cancelled_at,
    f.cancellation_reason,
    f.cancellation_note,
    (f.onboarding_completed_at is not null) as onboarding_established,
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

drop function if exists public.get_signup_request(uuid);

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
  invite_last_error text,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_note text,
  onboarding_established boolean
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
    sr.invite_last_error,
    sr.cancelled_at,
    sr.cancellation_reason,
    sr.cancellation_note,
    (sr.onboarding_completed_at is not null) as onboarding_established
  from private.signup_requests sr
  where sr.id = p_request_id;
end;
$$;

revoke execute on function public.get_signup_request(uuid) from public, anon;
grant execute on function public.get_signup_request(uuid) to authenticated;
grant execute on function public.get_signup_request(uuid) to service_role;

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
  v_block record;
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

  if v_row.status not in ('pending', 'approved') then
    return query select false, 'not_cancellable'::text, 'This signup request cannot be cancelled.'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_row.onboarding_completed_at is not null then
    return query
    select
      false,
      'completed'::text,
      'This user has already completed account setup. Manage the account from Users.'::text,
      null::uuid,
      null::uuid;
    return;
  end if;

  if v_row.created_profile_id is not null then
    select b.outcome_code, b.message
    into v_block
    from private.signup_linked_profile_cancellation_block(v_row.created_profile_id) b;

    if v_block.outcome_code is not null then
      return query
      select false, v_block.outcome_code, v_block.message, null::uuid, null::uuid;
      return;
    end if;
  end if;

  perform private.cancel_email_deliveries_for_signup_request(p_request_id);

  v_auth_id := coalesce(
    v_row.created_profile_id,
    private.auth_user_id_for_signup_email(v_row.normalized_email)
  );

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

  if not exists (
    select 1
    from auth.users au
    where au.id = v_auth_id
  ) then
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
