begin;
select no_plan();
\ir support/isolate_existing_owner.inc
\ir support/isolate_lunch_periods.inc

insert into auth.users (id, email, raw_user_meta_data) values
 ('a8111111-1111-4111-8111-111111111111', 'period-edit-accounts@test.local', '{"full_name":"Test Accounts"}'),
 ('a8222222-2222-4222-8222-222222222222', 'period-edit-staff@test.local', '{"full_name":"Test Staff"}'),
 ('a8333333-3333-4333-8333-333333333333', 'period-edit-hr@test.local', '{"full_name":"Test HR"}'),
 ('a8444444-4444-4444-8444-444444444444', 'period-edit-admin@test.local', '{"full_name":"Test Admin"}'),
 ('a8555555-5555-4555-8555-555555555555', 'period-edit-owner@test.local', '{"full_name":"Test Owner"}');
select private.apply_profile_role('a8111111-1111-4111-8111-111111111111', 'accounts');
select private.apply_profile_role('a8333333-3333-4333-8333-333333333333', 'hr');
select private.apply_profile_role('a8444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('a8555555-5555-4555-8555-555555555555', 'owner');

select is((select prosecdef from pg_proc where oid = 'public.update_lunch_period_details(uuid,text,date)'::regprocedure), true, 'SECURITY DEFINER');
select is((select proconfig from pg_proc where oid = 'public.update_lunch_period_details(uuid,text,date)'::regprocedure), array['search_path=""'], 'Empty search path');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'public.update_lunch_period_details(uuid,text,date)'::regprocedure), 'postgres', 'Explicit postgres ownership');
select ok(has_function_privilege('authenticated', 'public.update_lunch_period_details(uuid,text,date)', 'execute'), 'Authenticated has guarded execute');
select ok(not has_function_privilege('anon', 'public.update_lunch_period_details(uuid,text,date)', 'execute'), 'Anonymous has no execute');
select ok(not has_function_privilege('service_role', 'public.update_lunch_period_details(uuid,text,date)', 'execute'), 'No service-role bypass');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_lunch_period_details'), 1, 'Only one signature');

select set_config('app.allow_lunch_period_write', 'true', true);
insert into public.lunch_periods (id,label,start_date,end_date,updated_at) values
 ('a8611111-1111-4111-8111-111111111111','Historical','2026-01-01','2026-01-31','2000-01-01'),
 ('a8622222-2222-4222-8222-222222222222','Latest','2026-02-01','2026-02-28','2000-01-01');
select set_config('app.allow_lunch_period_write', '', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Lunch period management access required','Staff denied');
select set_config('request.jwt.claims', '{"sub":"a8333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Lunch period management access required','HR denied');
select set_config('request.jwt.claims', '{"sub":"a8444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Lunch period management access required','Permanent Admin denied');
select * from public.start_support_session('accounts','Test unified period edit',null);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Lunch period management access required','Active Admin Accounts Support Mode denied');
select set_config('request.jwt.claims', '{"sub":"a8555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Lunch period management access required','Permanent Owner denied');
select * from public.start_support_session('accounts','Test unified period edit',null);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Lunch period management access required','Active Owner Accounts Support Mode denied');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, 'P0001','Authentication required','Missing identity denied');
set local role anon;
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Denied','2026-03-01')$$, '42501',null,'Direct anonymous RPC denied');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select label from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), 'Latest','Rejected calls leave label unchanged');
select is((select end_date from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), '2026-02-28'::date,'Rejected calls leave date unchanged');
select lives_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222',' Latest ','2026-02-28')$$, 'Unchanged normalized input succeeds');
select is((select updated_at from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), '2000-01-01'::timestamptz,'No-op does not update timestamp');
select is((select updated_by from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), null::uuid,'No-op does not update actor');
select lives_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','  Renamed  ','2026-02-28')$$, 'Label-only save');
select is((select label from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), 'Renamed','Label trimmed');
select is((select end_date from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), '2026-02-28'::date,'Label-only preserves date');
select lives_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Renamed','2026-03-01')$$, 'End-date-only save');
select is((select label from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), 'Renamed','Date-only preserves label');
select is((select end_date from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), '2026-03-01'::date,'Date-only persists end date');
select lives_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Combined','2026-03-02')$$, 'Combined save');
select results_eq($$select label,end_date from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'$$, $$values ('Combined'::text,'2026-03-02'::date)$$,'Both values persisted');
select is((select updated_by from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'), 'a8111111-1111-4111-8111-111111111111'::uuid,'Authoritative actor recorded');
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Must roll back','2026-01-31')$$,'P0001','End date must be on or after the period start date','Invalid date aborts after attempted label write');
select results_eq($$select label,end_date from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'$$, $$values ('Combined'::text,'2026-03-02'::date)$$,'Both fields unchanged after failed combined save');
select lives_ok($$select public.update_lunch_period_details('a8611111-1111-4111-8111-111111111111','Historical renamed','2026-01-31')$$,'Historical label remains editable');
select throws_ok($$select public.update_lunch_period_details('a8611111-1111-4111-8111-111111111111','Must not save','2026-02-01')$$,'P0001','Only the latest lunch period end date may be adjusted','Historical dates locked');
select is((select label from public.lunch_periods where id='a8611111-1111-4111-8111-111111111111'), 'Historical renamed','Historical rejected save does not modify label');
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','  ','2026-03-03')$$,'P0001','Label is required','Blank label denied');
select throws_ok($$select public.update_lunch_period_details('a8622222-2222-4222-8222-222222222222','Invalid',null)$$,'P0001','End date is required','Missing date denied');
select throws_ok($$select public.update_lunch_period_details(null,'Missing','2026-03-03')$$,'P0001','Lunch period does not exist','Missing period denied');
select lives_ok($$select public.finalize_lunch_period('a8611111-1111-4111-8111-111111111111')$$,'Normal finalization still works');
select set_config('test.finalized_snapshot', (select finalized_daily_subsidy::text from public.lunch_periods where id='a8611111-1111-4111-8111-111111111111'), true);
select throws_ok($$select public.update_lunch_period_details('a8611111-1111-4111-8111-111111111111','Finalized edit','2026-02-01')$$,'P0001','Finalized lunch periods cannot be modified','Finalized period protected');
select is((select finalized_daily_subsidy::text from public.lunch_periods where id='a8611111-1111-4111-8111-111111111111'),current_setting('test.finalized_snapshot'),'Subsidy snapshot preserved');
select is((select status from public.lunch_periods where id='a8611111-1111-4111-8111-111111111111'),'finalized','Finalized status preserved');
select is((select start_date from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'),'2026-02-01'::date,'Start date unchanged');
select is((select is_current from public.lunch_periods where id='a8622222-2222-4222-8222-222222222222'),false,'Make Current remains separate');

select * from finish();
rollback;
