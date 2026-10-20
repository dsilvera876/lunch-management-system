-- Bind Support Mode mutations to the exact session state rendered by the caller.
-- The profile-row lock serializes Start and Exit even when no active session exists.

drop function if exists public.start_support_session(text, text);
drop function if exists public.end_support_session();
drop function if exists public.get_support_session_status();

create function public.get_support_session_status()
returns table (
  session_id uuid,
  scope text,
  reason text,
  started_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ss.id, ss.scope, ss.reason, ss.started_at, ss.expires_at
  from private.support_sessions ss
  inner join public.profiles p on p.id = ss.actor_profile_id
  where ss.actor_profile_id = (select private.current_user_id())
    and ss.ended_at is null
    and ss.expires_at > now()
    and p.account_status = 'active'
    and p.role in ('admin', 'owner')
  order by ss.started_at desc
  limit 1;
$$;

revoke all on function public.get_support_session_status() from public, anon;
grant execute on function public.get_support_session_status() to authenticated;

create function public.start_support_session(
  p_scope text,
  p_reason text,
  p_expected_session_id uuid
)
returns table (
  outcome text,
  session_id uuid,
  scope text,
  reason text,
  started_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_reason text;
  v_current_session_id uuid;
  v_new_session_id uuid;
  v_started timestamptz;
  v_expires timestamptz;
begin
  v_actor := (select private.current_user_id());
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_scope is null or p_scope not in ('hr', 'accounts') then
    raise exception 'Invalid support scope';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'Support reason is required';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'Support reason is too long';
  end if;

  -- This row lock is the per-actor mutation lock shared with Exit. It also
  -- keeps the permanent-role authorization stable through the mutation.
  select p.role
  into v_role
  from public.profiles p
  where p.id = v_actor
    and p.account_status = 'active'
  for update;

  if v_role is null then
    raise exception 'Active profile required';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Admin or Owner required';
  end if;

  perform private.expire_stale_support_sessions(v_actor);

  select ss.id
  into v_current_session_id
  from private.support_sessions ss
  where ss.actor_profile_id = v_actor
    and ss.ended_at is null
    and ss.expires_at > now()
  order by ss.started_at desc
  limit 1
  for update;

  if v_current_session_id is distinct from p_expected_session_id then
    return query
    select
      'stale'::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz;
    return;
  end if;

  if v_current_session_id is not null then
    update private.support_sessions ss
    set
      ended_at = now(),
      ended_reason = 'replaced'
    where ss.actor_profile_id = v_actor
      and ss.ended_at is null
      and ss.expires_at > now();
  end if;

  v_started := now();
  v_expires := v_started + interval '30 minutes';

  insert into private.support_sessions (
    actor_profile_id,
    actor_role,
    scope,
    reason,
    started_at,
    expires_at
  )
  values (
    v_actor,
    v_role,
    p_scope,
    v_reason,
    v_started,
    v_expires
  )
  returning id into v_new_session_id;

  return query
  select
    'started'::text,
    v_new_session_id,
    p_scope,
    v_reason,
    v_started,
    v_expires;
end;
$$;

revoke all on function public.start_support_session(text, text, uuid) from public, anon;
grant execute on function public.start_support_session(text, text, uuid) to authenticated;

create function public.end_support_session(p_expected_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_current_session_id uuid;
begin
  v_actor := (select private.current_user_id());
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_expected_session_id is null then
    raise exception 'Expected support session is required';
  end if;

  -- Use the same per-actor lock and authorization check as Start so the
  -- identity comparison and mutation are one atomic operation.
  select p.role
  into v_role
  from public.profiles p
  where p.id = v_actor
    and p.account_status = 'active'
  for update;

  if v_role is null then
    raise exception 'Active profile required';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Admin or Owner required';
  end if;

  perform private.expire_stale_support_sessions(v_actor);

  select ss.id
  into v_current_session_id
  from private.support_sessions ss
  where ss.actor_profile_id = v_actor
    and ss.ended_at is null
    and ss.expires_at > now()
  order by ss.started_at desc
  limit 1
  for update;

  if v_current_session_id is distinct from p_expected_session_id then
    return 'stale';
  end if;

  update private.support_sessions ss
  set
    ended_at = now(),
    ended_reason = 'manual'
  where ss.id = p_expected_session_id
    and ss.actor_profile_id = v_actor
    and ss.ended_at is null
    and ss.expires_at > now();

  if not found then
    return 'stale';
  end if;

  return 'ended';
end;
$$;

revoke all on function public.end_support_session(uuid) from public, anon;
grant execute on function public.end_support_session(uuid) to authenticated;
