begin;

select plan(12);

\ir support/reset_app_settings_baseline.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e8111111-1111-4111-8111-111111111111', 'provider-email-hr@test.local', '{"full_name":"Provider Email HR"}');

reset role;
select private.apply_profile_role('e8111111-1111-4111-8111-111111111111', 'hr');

-- Inactive provider may be created without order email
select lives_ok(
  $$ insert into public.lunch_providers (id, name, active, primary_order_email)
     values ('e9111111-1111-4111-8111-111111111111', 'Inactive No Email', false, null) $$,
  'Inactive provider can be inserted without provider order email'
);

-- Active provider requires email on insert
select throws_ok(
  $$ insert into public.lunch_providers (id, name, active)
     values ('e9211111-1111-4111-8111-111111111111', 'Active Omit Email Column', true) $$,
  'P0001',
  'Active providers require a provider order email',
  'Active provider insert omitting email column is rejected'
);

select throws_ok(
  $$ insert into public.lunch_providers (id, name, active, primary_order_email)
     values ('e9222222-2222-4222-8222-222222222222', 'Active Missing Email', true, null) $$,
  'P0001',
  'Active providers require a provider order email',
  'Active provider insert with null email is rejected'
);

select throws_ok(
  $$ insert into public.lunch_providers (id, name, active, primary_order_email)
     values ('e9255555-5555-4555-8555-555555555555', 'Active Blank Email', true, '') $$,
  'P0001',
  'Active providers require a provider order email',
  'Active provider insert with blank email is rejected'
);

select throws_ok(
  $$ insert into public.lunch_providers (id, name, active, primary_order_email)
     values ('e9333333-3333-4333-8333-333333333333', 'Active Invalid Email', true, 'not-an-email') $$,
  'P0001',
  'Invalid provider order email',
  'Active provider insert with invalid email is rejected'
);

select lives_ok(
  $$ insert into public.lunch_providers (id, name, active, primary_order_email)
     values ('e9444444-4444-4444-8444-444444444444', 'Active With Email', true, 'kitchen@example.test') $$,
  'Active provider insert with valid email succeeds'
);

select lives_ok(
  $$ insert into public.lunch_providers (id, name, active, primary_order_email)
     values ('e9466666-6666-4666-8666-666666666666', 'Active Fixture Email', true, 'provider-order+fixture@example.test') $$,
  'Active provider insert with explicit fixture test email succeeds'
);

-- Cannot activate inactive provider without email
select throws_ok(
  $$ update public.lunch_providers
     set active = true
     where id = 'e9111111-1111-4111-8111-111111111111' $$,
  'P0001',
  'Active providers require a provider order email',
  'Inactive provider without email cannot be activated'
);

select lives_ok(
  $$ update public.lunch_providers
     set primary_order_email = 'kitchen-inactive@example.test'
     where id = 'e9111111-1111-4111-8111-111111111111' $$,
  'Inactive provider can receive email before activation'
);

select lives_ok(
  $$ update public.lunch_providers
     set active = true
     where id = 'e9111111-1111-4111-8111-111111111111' $$,
  'Inactive provider with email can be activated'
);

-- Disabling late orders must not clear provider order email
select lives_ok(
  $$ update public.lunch_providers
     set accepts_late_orders = false,
         late_order_deadline_day = null,
         late_order_deadline_time = null
     where id = 'e9444444-4444-4444-8444-444444444444' $$,
  'Late-order settings can be disabled without touching order email column'
);

select is(
  (select primary_order_email from public.lunch_providers where id = 'e9444444-4444-4444-8444-444444444444'),
  'kitchen@example.test',
  'Provider order email persists when late orders are disabled'
);

select * from finish();

rollback;
