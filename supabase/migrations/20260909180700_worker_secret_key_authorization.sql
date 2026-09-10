-- Worker RPC authorization uses the effective Supabase API role supplied on each
-- request (service_role for Secret keys and legacy service_role JWT keys alike).
-- Application code must never parse or decode sb_secret_... values as JWTs.

create or replace function private.effective_request_api_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'role', ''),
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$$;

revoke all on function private.effective_request_api_role() from public, anon, authenticated;

create or replace function private.is_worker_service_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.effective_request_api_role() = 'service_role';
$$;

revoke all on function private.is_worker_service_caller() from public, anon, authenticated;
