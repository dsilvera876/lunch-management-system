-- Surface pending external-signup onboarding to the authenticated post-login gate.
-- Application authorization remains enforced by private.current_user_id().

drop function if exists public.get_authenticated_profile_for_login();

create function public.get_authenticated_profile_for_login()
returns table (
  role text,
  account_status text,
  onboarding_pending boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.role,
    p.account_status,
    exists (
      select 1
      from private.signup_requests sr
      where sr.created_profile_id = p.id
        and sr.status = 'approved'
        and sr.onboarding_completed_at is null
    ) as onboarding_pending
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_authenticated_profile_for_login() from public, anon;
grant execute on function public.get_authenticated_profile_for_login() to authenticated;
