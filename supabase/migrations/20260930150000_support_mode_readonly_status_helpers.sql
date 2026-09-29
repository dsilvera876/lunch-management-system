-- Support Mode status/RLS helpers must not write. Lazy expiration belongs on mutating RPCs only.

create or replace function private.expire_stale_support_sessions(p_actor uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.support_sessions ss
  set
    ended_at = now(),
    ended_reason = coalesce(ss.ended_reason, 'expired')
  where ss.ended_at is null
    and ss.expires_at <= now()
    and (p_actor is null or ss.actor_profile_id = p_actor);
end;
$$;

create or replace function private.active_support_scope()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ss.scope
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

create or replace function private.has_active_support_scope(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.active_support_scope()) is not null
    and (select private.active_support_scope()) = p_scope;
$$;

create or replace function public.get_support_session_status()
returns table (
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
  select ss.scope, ss.reason, ss.started_at, ss.expires_at
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
