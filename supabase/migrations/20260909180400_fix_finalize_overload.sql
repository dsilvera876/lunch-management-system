drop function if exists public.finalize_provider_late_order_supplement(uuid, boolean, text);

grant execute on function public.finalize_provider_late_order_supplement(uuid, boolean, text, jsonb, boolean)
to authenticated, service_role;

create or replace function private.is_worker_service_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.jwt() ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'service_role';
$$;
