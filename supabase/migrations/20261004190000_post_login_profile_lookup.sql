-- Post-login gate must distinguish inactive vs missing profile even when
-- profile self-read RLS uses private.current_user_id() (null for inactive).

create or replace function public.get_authenticated_profile_for_login()
returns table (
  role text,
  account_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.role, p.account_status
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_authenticated_profile_for_login() from public, anon;
grant execute on function public.get_authenticated_profile_for_login() to authenticated;
