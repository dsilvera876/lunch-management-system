-- Do not treat request.jwt.claim.role as service_role when a JWT payload is present
-- but omits role (authenticated sessions must not spoof worker via the claim GUC alone).

create or replace function private.effective_request_api_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'role', ''),
    case
      when auth.jwt() is null then nullif(current_setting('request.jwt.claim.role', true), '')
      else null
    end
  );
$$;

create or replace function private.is_worker_service_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.effective_request_api_role() = 'service_role',
    false
  );
$$;
