-- Allow role managers to update employee display names (not email or role).

create or replace function public.update_manageable_user_profile(
  p_profile_id uuid,
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
begin
  if (select private.current_user_id()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.can_manage_roles()) then
    raise exception 'Role management access required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_profile_id
  ) then
    raise exception 'Profile does not exist';
  end if;

  v_normalized := nullif(btrim(p_full_name), '');

  update public.profiles
  set full_name = v_normalized
  where id = p_profile_id;
end;
$$;

revoke execute on function public.update_manageable_user_profile(uuid, text) from public, anon;
grant execute on function public.update_manageable_user_profile(uuid, text) to authenticated;
