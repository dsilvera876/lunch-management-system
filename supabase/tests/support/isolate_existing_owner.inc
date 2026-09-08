-- Temporarily release the global Owner slot for tests that create or bootstrap
-- their own Owner. The enclosing test transaction always rolls this back.

reset role;

do $$
declare
  v_owner_id uuid;
begin
  for v_owner_id in
    select id
    from public.profiles
    where role = 'owner'
  loop
    perform private.apply_profile_role(v_owner_id, 'admin');
  end loop;
end;
$$;
