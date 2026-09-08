-- The display-category migration preserves this private SECURITY DEFINER
-- helper. Remove its inherited default EXECUTE privilege so only trusted
-- database-owned callers can create lunch-day/menu snapshots.
revoke execute
on function private.ensure_provider_lunch_day(uuid, date)
from public, anon, authenticated;
