-- Deterministic Jamaica calendar date after standard 2099 fixture period ends.
\ir pgtap_test_session.inc
select set_config('test.jamaica_today', '2099-12-31', true);
