-- Harden onboarding backfill and invite completion after Auth lifecycle verification.

-- Undo any marker that was inferred from Auth invite/OTP timestamps (not application evidence).
update private.signup_requests sr
set onboarding_completed_at = null
where sr.status = 'approved'
  and sr.created_profile_id is not null
  and sr.onboarding_completed_at is not null
  and not private.signup_onboarding_backfill_eligible(sr.created_profile_id);

drop function if exists public.complete_signup_onboarding();

create or replace function public.complete_signup_onboarding(
  p_require_linked_request boolean default false
)
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
    if p_require_linked_request then
      return jsonb_build_object(
        'ok', false,
        'code', 'no_signup_request',
        'message', 'No approved signup request is linked to this account.'
      );
    end if;

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

revoke execute on function public.complete_signup_onboarding(boolean) from public, anon;
grant execute on function public.complete_signup_onboarding(boolean) to authenticated;

create or replace function public.audit_ambiguous_signup_onboarding()
returns table (
  signup_request_id uuid,
  email text,
  created_profile_id uuid,
  invite_sent_at timestamptz,
  onboarding_completed_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  has_business_history boolean
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

  if not (select private.can_manage_signup_requests()) then
    raise exception 'Signup request management access required';
  end if;

  return query
  select
    sr.id as signup_request_id,
    sr.email,
    sr.created_profile_id,
    sr.invite_sent_at,
    sr.onboarding_completed_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    private.user_has_business_history(sr.created_profile_id) as has_business_history
  from private.signup_requests sr
  left join auth.users au
    on au.id = sr.created_profile_id
  where sr.status = 'approved'
    and sr.created_profile_id is not null
    and sr.onboarding_completed_at is null
  order by sr.requested_at desc, sr.email;
end;
$$;

revoke execute on function public.audit_ambiguous_signup_onboarding() from public, anon;
grant execute on function public.audit_ambiguous_signup_onboarding() to authenticated;
