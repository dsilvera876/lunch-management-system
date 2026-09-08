-- Lunch-period management is an Accounts function. Keep this permission
-- separate from broader HR operational capabilities.
create or replace function private.can_manage_lunch_periods()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['accounts', 'admin', 'owner']);
$$;

revoke all on function private.can_manage_lunch_periods() from public;
grant execute on function private.can_manage_lunch_periods() to authenticated;
