-- The trusted web route records authorization only after Supabase verifies an Auth token.

alter table private.signup_requests
  add column if not exists onboarding_setup_authorized_at timestamptz,
  add column if not exists onboarding_setup_authorization_expires_at timestamptz;

create or replace function public.service_authorize_signup_onboarding(
  p_user_id uuid,
  p_auth_action_type text,
  p_nonce text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.signup_requests%rowtype;
  v_auth_email text;
  v_invited_at timestamptz;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;
  if p_user_id is null or p_auth_action_type not in ('invite', 'recovery') then
    return false;
  end if;

  select private.normalize_signup_email(au.email::text), au.invited_at
  into v_auth_email, v_invited_at
  from auth.users au
  where au.id = p_user_id;

  if not found then
    return false;
  end if;

  select * into v_request
  from private.signup_requests sr
  where sr.created_profile_id = p_user_id
    and sr.normalized_email = v_auth_email
    and sr.status = 'approved'
  order by sr.requested_at desc
  limit 1
  for update;

  if not found or v_request.onboarding_completed_at is not null then
    return false;
  end if;

  if p_auth_action_type = 'recovery' then
    if p_nonce is null
       or v_request.account_setup_recovery_nonce_hash
            is distinct from private.hash_signup_recovery_nonce(p_nonce)
       or v_request.account_setup_recovery_requested_at is null
       or v_request.account_setup_recovery_requested_at <= now() - interval '1 hour' then
      return false;
    end if;
  elsif v_invited_at is null then
    return false;
  end if;

  update private.signup_requests sr
  set
    onboarding_setup_authorized_at = now(),
    onboarding_setup_authorization_expires_at = now() + interval '30 minutes',
    account_setup_recovery_nonce_hash = case
      when p_auth_action_type = 'recovery' then null
      else sr.account_setup_recovery_nonce_hash
    end,
    account_setup_recovery_requested_at = case
      when p_auth_action_type = 'recovery' then null
      else sr.account_setup_recovery_requested_at
    end
  where sr.id = v_request.id;

  return true;
end;
$$;

revoke execute on function public.service_authorize_signup_onboarding(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.service_authorize_signup_onboarding(uuid, text, text)
  to service_role;

revoke execute on function public.complete_signup_onboarding(boolean)
  from public, anon, authenticated, service_role;

create or replace function public.service_complete_signup_onboarding(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.signup_requests%rowtype;
  v_auth_email text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;
  if p_user_id is null then
    raise exception 'User identity is required';
  end if;

  select * into v_request
  from private.signup_requests sr
  where sr.created_profile_id = p_user_id and sr.status = 'approved'
  order by sr.requested_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_signup_request');
  end if;
  if v_request.onboarding_completed_at is not null then
    return jsonb_build_object('ok', true, 'code', 'already_completed');
  end if;

  select private.normalize_signup_email(au.email::text)
  into v_auth_email
  from auth.users au
  where au.id = p_user_id;

  if not found or v_auth_email is distinct from v_request.normalized_email then
    return jsonb_build_object('ok', false, 'code', 'identity_mismatch');
  end if;
  if v_request.onboarding_setup_authorized_at is null
     or v_request.onboarding_setup_authorization_expires_at is null
     or v_request.onboarding_setup_authorization_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  update private.signup_requests sr
  set
    onboarding_completed_at = now(),
    onboarding_setup_authorized_at = null,
    onboarding_setup_authorization_expires_at = null,
    account_setup_recovery_nonce_hash = null,
    account_setup_recovery_requested_at = null
  where sr.id = v_request.id;

  return jsonb_build_object('ok', true, 'code', 'completed');
end;
$$;

revoke execute on function public.service_complete_signup_onboarding(uuid)
  from public, anon, authenticated;
grant execute on function public.service_complete_signup_onboarding(uuid)
  to service_role;

create or replace function private.cancel_signup_recovery_after_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is null then
    update private.email_delivery_queue q
    set status = 'failed', last_error = 'Superseded: account setup completed.'
    where q.auth_signup_request_id = new.id
      and q.status in ('pending', 'processing');
  end if;
  return new;
end;
$$;

revoke all on function private.cancel_signup_recovery_after_onboarding()
  from public, anon, authenticated;

drop trigger if exists signup_request_cancel_recovery_after_onboarding
  on private.signup_requests;
create trigger signup_request_cancel_recovery_after_onboarding
  after update of onboarding_completed_at on private.signup_requests
  for each row execute function private.cancel_signup_recovery_after_onboarding();
