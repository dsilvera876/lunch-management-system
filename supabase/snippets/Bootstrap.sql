do $$
declare
  v_profile_id uuid;
  v_owner_count integer;
begin
  -- Safety check: bootstrap is only valid when no Owner exists.
  select count(*)
  into v_owner_count
  from public.profiles
  where role = 'owner';

  if v_owner_count > 0 then
    raise exception 'An Owner already exists. Use transfer_ownership instead.';
  end if;

  -- Find the profile belonging to the intended first Owner.
  select p.id
  into v_profile_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower('dsilvera@jbdc.net');

  if v_profile_id is null then
    raise exception 'No profile found for that email address';
  end if;

  -- Use the trusted role-change mechanism.
  perform private.apply_profile_role(v_profile_id, 'owner');
end;
$$;