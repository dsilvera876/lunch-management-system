-- Separate HR operational access from Accounts financial access.
-- HR: orders, providers, locations. Accounts: lunch periods, financial summaries.

create or replace function private.can_view_all_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['hr', 'admin', 'owner']);
$$;

revoke all on function private.can_view_all_orders() from public;
grant execute on function private.can_view_all_orders() to authenticated;

create or replace function private.can_view_all_financial_summaries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_view_all_financial_summaries() from public;
grant execute on function private.can_view_all_financial_summaries() to authenticated;
