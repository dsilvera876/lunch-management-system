begin;

select plan(36);

\ir support/reset_app_settings_baseline.inc

update public.app_settings
set order_cutoff_time = '00:00:01'
where id = 1;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f8111111-1111-4111-8111-111111111111', 'primary-hr@test.local', '{"full_name":"Primary HR"}'),
  ('f8222222-2222-4222-8222-222222222222', 'primary-staff@test.local', '{"full_name":"Primary Staff"}'),
  ('f8333333-3333-4333-8333-333333333333', 'primary-admin@test.local', '{"full_name":"Primary Admin"}');

reset role;
select private.apply_profile_role('f8111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('f8222222-2222-4222-8222-222222222222', 'staff');
select private.apply_profile_role('f8333333-3333-4333-8333-333333333333', 'admin');

insert into public.lunch_providers (
  id, name, active, primary_order_email
)
values
  ('f9111111-1111-4111-8111-111111111111', 'Primary Provider A', true, 'kitchen-a@example.test'),
  ('f9222222-2222-4222-8222-222222222222', 'Primary Provider B', true, 'kitchen-b@example.test'),
  ('f9333333-3333-4333-8333-333333333333', 'Primary Provider Missing Email', true, null);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
  ('fa111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111', 'Main A', 10, 'main', 'Each', true),
  ('fa222222-2222-4222-8222-222222222222', 'f9222222-2222-4222-8222-222222222222', 'Main B', 10, 'main', 'Each', true),
  ('fa333333-3333-4333-8333-333333333333', 'f9333333-3333-4333-8333-333333333333', 'Main C', 10, 'main', 'Each', true);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select item_id, weekday
from (
  values
    ('fa111111-1111-4111-8111-111111111111'::uuid),
    ('fa222222-2222-4222-8222-222222222222'::uuid),
    ('fa333333-3333-4333-8333-333333333333'::uuid)
) items(item_id)
cross join generate_series(1, 5) as weekday;

\ir support/open_ordering.inc
\ir support/isolate_lunch_periods.inc
\ir support/assign_test_office_defaults.inc
\ir support/primary_order_dispatch_fixture.inc

select is(
  coalesce(array_length(private.eligible_primary_normal_order_ids(
    'f9111111-1111-4111-8111-111111111111',
    current_setting('test.primary_delivery_date')::date
  ), 1), 0),
  1,
  'Eligible primary normal order ids includes submitted normal order'
);

select ok(
  not ('f0b99999-9999-4999-8999-999999999999'::uuid = any(
    private.eligible_primary_normal_order_ids(
      'f9111111-1111-4111-8111-111111111111',
      current_setting('test.primary_delivery_date')::date
    )
  )),
  'Late order id is not in eligible primary list'
);

select is(
  coalesce(array_length(private.eligible_primary_normal_order_ids(
    'f9222222-2222-4222-8222-222222222222',
    current_setting('test.primary_delivery_date')::date
  ), 1), 0),
  0,
  'Provider with no normal orders has empty primary eligibility'
);

select ok(
  (select timing_configurable from private.notification_event_catalog where event_key = 'provider.daily_order_summary') = false,
  'Catalog no longer exposes configurable send time for daily order summary'
);

-- HR manual claim requires manage HR
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9111111-1111-4111-8111-111111111111',
      %L::date,
      null
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'P0001',
  null,
  'Admin cannot manually claim primary dispatch'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9111111-1111-4111-8111-111111111111',
      %L::date,
      null
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'HR can claim manual primary dispatch'
);

select is(
  (select status from public.provider_primary_order_dispatches
   where provider_id = 'f9111111-1111-4111-8111-111111111111'
   order by created_at desc limit 1),
  'pending',
  'Manual claim creates pending primary dispatch'
);

select lives_ok(
  $$ select public.finalize_provider_primary_order(
    (select id from public.provider_primary_order_dispatches
      where provider_id = 'f9111111-1111-4111-8111-111111111111'
      order by created_at desc limit 1),
    true,
    null,
    '{"provider_message_id":"test"}'::jsonb,
    false
  ) $$,
  'HR can finalize primary dispatch as sent'
);

select is(
  (select count(*)::integer from public.provider_primary_order_dispatch_orders pdo
    join public.provider_primary_order_dispatches d on d.id = pdo.dispatch_id
    where d.provider_id = 'f9111111-1111-4111-8111-111111111111'
      and d.status = 'sent'),
  1,
  'Successful primary dispatch records included order id'
);

reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  not exists (
    select 1
    from jsonb_array_elements(public.worker_list_due_automatic_primary_batches()) batch
    where batch ->> 'provider_id' = 'f9111111-1111-4111-8111-111111111111'
      and batch ->> 'scheduled_delivery_date' = current_setting('test.primary_delivery_date')
  ),
  'Successful manual primary send excludes provider from automatic due batches'
);

select lives_ok(
  format(
    $$ select public.worker_claim_automatic_provider_primary_order(
      'f9333333-3333-4333-8333-333333333333',
      %L::date,
      current_setting('test.primary_order_date')::date
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'Automatic primary opportunity for missing email provider'
);

select is(
  (select outcome from public.provider_primary_order_automatic_opportunities
   where provider_id = 'f9333333-3333-4333-8333-333333333333'
     and scheduled_delivery_date = current_setting('test.primary_delivery_date')::date),
  'email_missing',
  'Missing provider email records email_missing without sent dispatch'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- Resend creates new dispatch with resend_of link
select lives_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9111111-1111-4111-8111-111111111111',
      %L::date,
      (select id from public.provider_primary_order_dispatches
        where provider_id = 'f9111111-1111-4111-8111-111111111111'
          and status = 'sent'
        order by created_at desc limit 1)
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'HR resend claim references prior dispatch snapshot'
);

select ok(
  exists (
    select 1
    from public.provider_primary_order_dispatches
    where provider_id = 'f9111111-1111-4111-8111-111111111111'
      and resend_of_dispatch_id is not null
  ),
  'Resend dispatch stores resend_of_dispatch_id'
);

select lives_ok(
  $$ select public.finalize_provider_primary_order(
    (select id from public.provider_primary_order_dispatches
      where provider_id = 'f9111111-1111-4111-8111-111111111111'
        and status = 'pending'
      order by created_at desc limit 1),
    true,
    null,
    '{"provider_message_id":"resend"}'::jsonb,
    false
  ) $$,
  'Successful resend finalize does not violate order link uniqueness'
);

select is(
  (select dispatch_id from public.provider_primary_order_dispatch_orders
    where order_id = 'f0b11111-1111-4111-8111-111111111111'),
  (select id from public.provider_primary_order_dispatches
    where provider_id = 'f9111111-1111-4111-8111-111111111111'
      and status = 'sent'
      and resend_of_dispatch_id is null
    order by created_at asc limit 1),
  'After successful resend, order link still points to first successful dispatch'
);

select lives_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9111111-1111-4111-8111-111111111111',
      %L::date,
      (select id from public.provider_primary_order_dispatches
        where provider_id = 'f9111111-1111-4111-8111-111111111111'
          and status = 'sent'
          and resend_of_dispatch_id is null
        order by created_at asc limit 1)
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'Second resend claim allowed after first resend sent'
);

select lives_ok(
  $$ select public.finalize_provider_primary_order(
    (select id from public.provider_primary_order_dispatches
      where provider_id = 'f9111111-1111-4111-8111-111111111111'
        and status = 'pending'
      order by created_at desc limit 1),
    true,
    null,
    '{"provider_message_id":"resend2"}'::jsonb,
    false
  ) $$,
  'Repeated successful resend finalize is idempotent for order links'
);

select is(
  (select count(*)::integer from public.provider_primary_order_dispatch_orders
    where order_id = 'f0b11111-1111-4111-8111-111111111111'),
  1,
  'Repeated resend does not duplicate order dispatch links'
);

-- Failed original then successful resend links order to successful resend dispatch
select lives_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9333333-3333-4333-8333-333333333333',
      %L::date,
      null
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'Manual claim for provider C before failed original path'
);

select lives_ok(
  $$ select public.finalize_provider_primary_order(
    (select id from public.provider_primary_order_dispatches
      where provider_id = 'f9333333-3333-4333-8333-333333333333'
        and status = 'pending'
      order by created_at desc limit 1),
    false,
    'SMTP failure',
    null,
    false
  ) $$,
  'Failed original primary dispatch finalize'
);

select lives_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9333333-3333-4333-8333-333333333333',
      %L::date,
      (select id from public.provider_primary_order_dispatches
        where provider_id = 'f9333333-3333-4333-8333-333333333333'
          and status = 'failed'
        order by created_at desc limit 1)
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'Resend claim after failed original primary dispatch'
);

select is(
  (select count(*)::integer from jsonb_array_elements_text(
    (select message_metadata -> 'order_ids'
     from public.provider_primary_order_dispatches
     where provider_id = 'f9333333-3333-4333-8333-333333333333'
       and status = 'pending'
     order by created_at desc
     limit 1)
  )),
  1,
  'Provider C resend pending metadata includes exactly one order id'
);

select lives_ok(
  $$ select public.finalize_provider_primary_order(
    (select id from public.provider_primary_order_dispatches
      where provider_id = 'f9333333-3333-4333-8333-333333333333'
        and status = 'pending'
      order by created_at desc limit 1),
    true,
    null,
    '{"provider_message_id":"resend-after-fail"}'::jsonb,
    false
  ) $$,
  'Successful resend after failed original creates order links'
);

select is(
  (select count(*)::integer from public.provider_primary_order_dispatch_orders
    where order_id = 'f0b33333-3333-4333-8333-333333333333'),
  1,
  'Provider C order link row exists after successful resend finalize'
);

select is(
  (select dispatch_id from public.provider_primary_order_dispatch_orders
    where order_id = 'f0b33333-3333-4333-8333-333333333333'),
  (select id from public.provider_primary_order_dispatches
    where provider_id = 'f9333333-3333-4333-8333-333333333333'
      and status = 'sent'
    order by created_at desc limit 1),
  'Failed original then successful resend links order to successful resend dispatch'
);

-- Resend copies immutable email snapshot from original dispatch metadata
reset role;

update public.provider_primary_order_dispatches
set message_metadata = message_metadata || jsonb_build_object(
  'email_snapshot',
  jsonb_build_object(
    'providerName', 'Snapshot Kitchen',
    'deliveryDate', current_setting('test.primary_delivery_date'),
    'providerGroup', jsonb_build_object('providerId', 'f9111111-1111-4111-8111-111111111111', 'offices', '[]'::jsonb)
  )
)
where id = (
  select id
  from public.provider_primary_order_dispatches
  where provider_id = 'f9111111-1111-4111-8111-111111111111'
    and status = 'sent'
    and resend_of_dispatch_id is null
  order by created_at asc
  limit 1
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9111111-1111-4111-8111-111111111111',
      %L::date,
      (select id from public.provider_primary_order_dispatches
        where provider_id = 'f9111111-1111-4111-8111-111111111111'
          and status = 'sent'
          and resend_of_dispatch_id is null
        order by created_at asc limit 1)
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'Resend claim for snapshot copy test'
);

select is(
  (select message_metadata -> 'email_snapshot' ->> 'providerName'
   from public.provider_primary_order_dispatches
   where provider_id = 'f9111111-1111-4111-8111-111111111111'
     and status = 'pending'
   order by created_at desc limit 1),
  'Snapshot Kitchen',
  'Resend dispatch copies email_snapshot from original dispatch'
);

-- Manual initial send rejected before authoritative cutoff (2099 fixture)
reset role;

insert into public.lunch_days (
  id, lunch_date, order_date, provider_id, order_deadline, status
)
values (
  'f0d44444-4444-4444-8444-444444444444',
  public.delivery_date_for_order_date('2099-01-05'::date),
  '2099-01-05'::date,
  'f9111111-1111-4111-8111-111111111111',
  public.order_deadline_for_order_date('2099-01-05'::date),
  'open'
);

insert into public.menu_items (
  id, lunch_day_id, provider_menu_item_id, name, price, item_type, unit_label, is_active
)
values (
  'f0a44444-4444-4444-8444-444444444444',
  'f0d44444-4444-4444-8444-444444444444',
  'fa111111-1111-4111-8111-111111111111',
  'Future Main',
  10,
  'main',
  'Each',
  true
);

set session_replication_role = replica;

insert into public.orders (
  id, profile_id, lunch_day_id, status, delivery_state, financial_disposition, is_late_order
)
values (
  'f0b44444-4444-4444-8444-444444444444',
  'f8222222-2222-4222-8222-222222222222',
  'f0d44444-4444-4444-8444-444444444444',
  'submitted',
  'pending',
  'chargeable',
  false
);

insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity, unit_price)
values (
  'f0b44444-4444-4444-8444-444444444444',
  'f0a44444-4444-4444-8444-444444444444',
  'f0d44444-4444-4444-8444-444444444444',
  1,
  10
);

set session_replication_role = default;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'f8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  format(
    $$ select public.claim_provider_primary_order_manual(
      'f9111111-1111-4111-8111-111111111111',
      %L::date,
      null
    ) $$,
    public.delivery_date_for_order_date('2099-01-05'::date)
  ),
  'P0001',
  'Primary provider order cannot be sent before the normal staff ordering cutoff',
  'Manual initial primary send rejected before cutoff'
);

reset role;

-- Service role worker finalize + failure alerts
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  format(
    $$ select public.worker_claim_automatic_provider_primary_order(
      'f9222222-2222-4222-8222-222222222222',
      %L::date,
      current_setting('test.primary_order_date')::date
    ) $$,
    current_setting('test.primary_delivery_date')::date
  ),
  'Automatic primary opportunity processes for provider B (may be no_orders)'
);

select is(
  (select outcome from public.provider_primary_order_automatic_opportunities
   where provider_id = 'f9222222-2222-4222-8222-222222222222'
     and scheduled_delivery_date = current_setting('test.primary_delivery_date')::date),
  'no_orders',
  'Zero qualifying orders records no_orders opportunity without dispatch email'
);

select is(
  (select count(*)::integer from public.provider_primary_order_dispatches
    where provider_id = 'f9222222-2222-4222-8222-222222222222'),
  0,
  'Zero qualifying orders does not create primary dispatch row'
);

reset role;

-- Failure alert on terminal failed primary dispatch
insert into public.provider_primary_order_dispatches (
  provider_id,
  scheduled_delivery_date,
  dispatch_type,
  status,
  provider_email,
  message_metadata
)
values (
  'f9111111-1111-4111-8111-111111111111',
  current_setting('test.primary_delivery_date')::date,
  'automatic',
  'failed',
  'kitchen-a@example.test',
  '{"order_ids": []}'::jsonb
);

select lives_ok(
  $$ select private.safe_notify_provider_primary_email_dispatch_failure(
    (select id from public.provider_primary_order_dispatches
      where provider_id = 'f9111111-1111-4111-8111-111111111111'
        and status = 'failed'
      order by created_at desc limit 1)
  ) $$,
  'Primary dispatch failure enqueues admin/hr failure notifications'
);

select ok(
  exists (
    select 1 from private.notification_delivery_log
    where event_key = 'hr.email_delivery_failure'
      and provider_failure_kind = 'primary_lunch_order'
      and failed_provider_primary_dispatch_id is not null
  ),
  'HR failure log references primary dispatch id only'
);

select ok(
  not exists (
    select 1 from private.notification_delivery_log ndl
    join public.orders o on false
    where ndl.event_key = 'hr.email_delivery_failure'
      and ndl.provider_failure_kind = 'primary_lunch_order'
      and ndl.failed_provider_dispatch_id is not null
  ),
  'Primary failure alert does not use supplemental dispatch foreign key'
);

-- Global disable: worker list empty
update private.notification_settings
set enabled = false
where event_key = 'provider.daily_order_summary';

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select jsonb_array_length(public.worker_list_due_automatic_primary_batches())),
  0,
  'Globally disabled primary email yields no automatic batches'
);

reset role;

update private.notification_settings
set enabled = true
where event_key = 'provider.daily_order_summary';

select * from finish();

rollback;
