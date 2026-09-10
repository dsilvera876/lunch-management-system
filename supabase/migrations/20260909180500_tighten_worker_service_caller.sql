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
