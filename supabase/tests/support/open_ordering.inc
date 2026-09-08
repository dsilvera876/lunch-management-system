-- Ensures provider ordering is open for deterministic pgTAP runs.
-- Safe within BEGIN/ROLLBACK test transactions only.

reset role;

update public.app_settings
set order_cutoff_time = '23:59:00'
where id = 1;

\ir office_location_fixture.inc
\ir assign_test_office_defaults.inc
