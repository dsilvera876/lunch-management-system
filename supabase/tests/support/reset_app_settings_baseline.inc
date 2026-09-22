-- Restore app_settings baseline expected by pgTAP (migration default cutoff).
-- Safe within BEGIN/ROLLBACK test transactions only.

reset role;

update public.app_settings
set order_cutoff_time = '16:00:00'
where id = 1;
