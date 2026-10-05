-- Enables deterministic test.* GUC overrides for pgTAP only (transaction-local).
select set_config('app.pgtap_test_session', 'true', true);
