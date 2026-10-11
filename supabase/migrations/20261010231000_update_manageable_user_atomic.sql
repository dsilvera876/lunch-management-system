-- Save a role manager's name and role edits in one transaction.
--
-- The edit drawer previously called update_manageable_user_profile and then
-- assign_user_role as separate RPCs, so a rejected role change still saved the
-- name. This wrapper runs both in a single function call: any failure in the
-- role change rolls back the name update. Authorization, Owner protection,
-- Support Mode blocking, and auditing remain in the existing functions.

create or replace function public.update_manageable_user(
  p_profile_id uuid,
  p_full_name text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_role text;
begin
  perform public.update_manageable_user_profile(p_profile_id, p_full_name);

  if p_role is null then
    return;
  end if;

  select role
  into v_current_role
  from public.profiles
  where id = p_profile_id
  for update;

  if v_current_role is distinct from p_role then
    perform public.assign_user_role(p_profile_id, p_role);
  end if;
end;
$$;

revoke execute on function public.update_manageable_user(uuid, text, text) from public, anon;
grant execute on function public.update_manageable_user(uuid, text, text) to authenticated;
