-- Durable Auth cleanup tracking for permanent account deletion.

alter table private.user_account_deletion_audit
  add column if not exists auth_delete_status text not null default 'pending'
    check (auth_delete_status in ('pending', 'succeeded', 'failed')),
  add column if not exists auth_delete_attempts integer not null default 0
    check (auth_delete_attempts >= 0),
  add column if not exists auth_delete_last_error text,
  add column if not exists auth_deleted_at timestamptz,
  add column if not exists auth_delete_next_attempt_at timestamptz not null default now(),
  add column if not exists auth_delete_claimed_at timestamptz;

create unique index if not exists user_account_deletion_audit_profile_uidx
  on private.user_account_deletion_audit (deleted_profile_id);

create index if not exists user_account_deletion_audit_auth_pending_idx
  on private.user_account_deletion_audit (auth_delete_next_attempt_at)
  where auth_delete_status = 'pending';

create or replace function private.sanitize_auth_deletion_error(p_error text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_error is null or btrim(p_error) = '' then null
    else left(
      regexp_replace(
        btrim(p_error),
        '(token_hash|access_token|refresh_token|password|secret|jwt)=[^&\s]+',
        '\1=[redacted]',
        'gi'
      ),
      500
    )
  end;
$$;

revoke all on function private.sanitize_auth_deletion_error(text) from public, anon, authenticated;

create or replace function public.service_finalize_auth_user_deletion(
  p_audit_id uuid,
  p_outcome text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.user_account_deletion_audit;
  v_max_attempts constant integer := 8;
  v_backoff_seconds integer;
  v_error text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_row
  from private.user_account_deletion_audit a
  where a.id = p_audit_id
  for update;

  if not found then
    raise exception 'Deletion audit record not found';
  end if;

  if v_row.auth_delete_status = 'succeeded' then
    return jsonb_build_object(
      'ok', true,
      'auth_delete_status', 'succeeded',
      'already_finalized', true
    );
  end if;

  v_error := private.sanitize_auth_deletion_error(p_error);

  if p_outcome in ('succeeded', 'missing_user') then
    update private.user_account_deletion_audit a
    set
      auth_delete_status = 'succeeded',
      auth_deleted_at = coalesce(a.auth_deleted_at, now()),
      auth_delete_last_error = null,
      auth_delete_claimed_at = null,
      auth_delete_next_attempt_at = now()
    where a.id = p_audit_id;

    return jsonb_build_object(
      'ok', true,
      'auth_delete_status', 'succeeded'
    );
  end if;

  if p_outcome <> 'retry' then
    raise exception 'Invalid auth deletion outcome';
  end if;

  if v_row.auth_delete_attempts + 1 >= v_max_attempts then
    update private.user_account_deletion_audit a
    set
      auth_delete_status = 'failed',
      auth_delete_attempts = a.auth_delete_attempts + 1,
      auth_delete_last_error = coalesce(v_error, 'Authentication cleanup failed'),
      auth_delete_claimed_at = null,
      auth_delete_next_attempt_at = now()
    where a.id = p_audit_id;

    return jsonb_build_object(
      'ok', true,
      'auth_delete_status', 'failed',
      'terminal', true
    );
  end if;

  v_backoff_seconds := least(
    900,
    30 * power(2, greatest(v_row.auth_delete_attempts, 0))::integer
  );

  update private.user_account_deletion_audit a
  set
    auth_delete_status = 'pending',
    auth_delete_attempts = a.auth_delete_attempts + 1,
    auth_delete_last_error = coalesce(v_error, 'Authentication cleanup failed'),
    auth_delete_claimed_at = null,
    auth_delete_next_attempt_at = now() + make_interval(secs => v_backoff_seconds)
  where a.id = p_audit_id;

  return jsonb_build_object(
    'ok', true,
    'auth_delete_status', 'pending',
    'next_attempt_at', (select a.auth_delete_next_attempt_at from private.user_account_deletion_audit a where a.id = p_audit_id)
  );
end;
$$;

revoke execute on function public.service_finalize_auth_user_deletion(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.service_finalize_auth_user_deletion(uuid, text, text) to service_role;

create or replace function public.worker_claim_pending_auth_user_deletions(p_limit integer default 10)
returns setof private.user_account_deletion_audit
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  return query
  with candidates as (
    select a.id
    from private.user_account_deletion_audit a
    where a.auth_delete_status = 'pending'
      and a.auth_delete_next_attempt_at <= now()
      and a.auth_delete_claimed_at is null
    order by a.auth_delete_next_attempt_at, a.deleted_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update private.user_account_deletion_audit a
  set auth_delete_claimed_at = now()
  from candidates c
  where a.id = c.id
  returning a.*;
end;
$$;

revoke execute on function public.worker_claim_pending_auth_user_deletions(integer)
  from public, anon, authenticated;
grant execute on function public.worker_claim_pending_auth_user_deletions(integer) to service_role;

create or replace function public.permanently_delete_user_account(
  p_profile_id uuid,
  p_reason_category text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_normalized text;
  v_category text;
  v_note text;
  v_eligibility jsonb;
  v_audit_id uuid;
  v_auth_status text;
begin
  v_actor := (select private.current_user_id());

  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role management access required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
  ) then
    select a.id, a.auth_delete_status
    into v_audit_id, v_auth_status
    from private.user_account_deletion_audit a
    where a.deleted_profile_id = p_profile_id
    order by a.deleted_at desc
    limit 1;

    if v_audit_id is not null then
      return jsonb_build_object(
        'ok', true,
        'profile_id', p_profile_id,
        'audit_id', v_audit_id,
        'auth_delete_status', v_auth_status,
        'normalized_email', (
          select a.normalized_email
          from private.user_account_deletion_audit a
          where a.id = v_audit_id
        ),
        'already_deleted', true
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'User not found.'
    );
  end if;

  v_eligibility := public.get_user_deletion_eligibility(p_profile_id);

  if coalesce((v_eligibility ->> 'can_delete')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'ineligible',
      'message', v_eligibility ->> 'blocker_summary'
    );
  end if;

  v_category := lower(btrim(p_reason_category));
  if v_category not in ('test_account', 'duplicate_error', 'other') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_reason',
      'message', 'Choose a valid deletion reason.'
    );
  end if;

  v_note := nullif(btrim(p_reason_note), '');

  select p.role, private.normalize_signup_email(au.email::text)
  into v_role, v_normalized
  from public.profiles p
  inner join auth.users au on au.id = p.id
  where p.id = p_profile_id;

  if v_role is null or v_normalized is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'User not found.'
    );
  end if;

  perform private.cleanup_identity_records_for_account_deletion(
    p_profile_id,
    v_normalized
  );

  insert into private.user_account_deletion_audit (
    deleted_profile_id,
    normalized_email,
    previous_role,
    deleted_by,
    reason_category,
    reason_note,
    auth_delete_status,
    auth_delete_next_attempt_at
  )
  values (
    p_profile_id,
    v_normalized,
    v_role,
    v_actor,
    v_category,
    v_note,
    'pending',
    now()
  )
  returning id into v_audit_id;

  delete from public.profiles p
  where p.id = p_profile_id;

  return jsonb_build_object(
    'ok', true,
    'profile_id', p_profile_id,
    'audit_id', v_audit_id,
    'auth_delete_status', 'pending',
    'normalized_email', v_normalized
  );
exception
  when unique_violation then
    select a.id, a.auth_delete_status, a.normalized_email
    into v_audit_id, v_auth_status, v_normalized
    from private.user_account_deletion_audit a
    where a.deleted_profile_id = p_profile_id;

    return jsonb_build_object(
      'ok', true,
      'profile_id', p_profile_id,
      'audit_id', v_audit_id,
      'auth_delete_status', v_auth_status,
      'normalized_email', v_normalized,
      'already_deleted', true
    );
  when others then
    if sqlerrm like 'Profile with business history cannot be deleted%' then
      return jsonb_build_object(
        'ok', false,
        'code', 'business_history',
        'message', 'This account has lunch history and cannot be permanently deleted. HR should deactivate the account instead.'
      );
    end if;

    if sqlerrm like 'Owner profile cannot be deleted%' then
      return jsonb_build_object(
        'ok', false,
        'code', 'owner_target',
        'message', 'This Owner account must be transferred before it can be deleted.'
      );
    end if;

    raise;
end;
$$;

-- Email reuse requires Auth identity removal, not only profile deletion.
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
    where private.normalize_signup_email(au.email::text) = p_normalized_email
  );
$$;

revoke all on function private.signup_email_has_application_account(text) from public, anon, authenticated;
