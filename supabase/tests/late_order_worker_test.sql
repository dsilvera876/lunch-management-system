begin;

select plan(37);

insert into auth.users (id, email, raw_user_meta_data)
values
(
  'd8111111-1111-4111-8111-111111111111',
  'worker-hr@test.local',
  '{"full_name":"Worker HR"}'
),
(
  'd8222222-2222-4222-8222-222222222222',
  'worker-staff@test.local',
  '{"full_name":"Worker Staff"}'
),
(
  'd8333333-3333-4333-8333-333333333333',
  'worker-accounts@test.local',
  '{"full_name":"Worker Accounts"}'
);

reset role;
select private.apply_profile_role('d8111111-1111-4111-8111-111111111111', 'hr');
select private.apply_profile_role('d8222222-2222-4222-8222-222222222222', 'staff');
select private.apply_profile_role('d8333333-3333-4333-8333-333333333333', 'accounts');

insert into public.lunch_providers (
  id,
  name,
  active,
  accepts_late_orders,
  late_order_deadline_day,
  late_order_deadline_time,
  supplemental_dispatch_mode,
  automatic_supplement_send_day,
  automatic_supplement_send_time,
  primary_order_email
)
values
(
  'd9111111-1111-4111-8111-111111111111',
  'Worker Auto Provider',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'automatic',
  'delivery_day',
  '10:00:00',
  'auto-kitchen@example.com'
),
(
  'd9222222-2222-4222-8222-222222222222',
  'Worker Manual Provider',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  null,
  null,
  'manual-kitchen@example.com'
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values
(
  'da111111-1111-4111-8111-111111111111',
  'd9111111-1111-4111-8111-111111111111',
  'Auto Main',
  10.00,
  'standalone',
  'Each',
  true
),
(
  'da222222-2222-4222-8222-222222222222',
  'd9222222-2222-4222-8222-222222222222',
  'Manual Main',
  10.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select item_id, weekday
from (
  values
    ('da111111-1111-4111-8111-111111111111'::uuid),
    ('da222222-2222-4222-8222-222222222222'::uuid)
) as items(item_id)
cross join generate_series(1, 5) as weekday;

\ir support/open_ordering.inc
\ir support/late_order_cycle.inc

do $$
begin
  perform set_config(
    'test.worker_order_date',
    current_setting('test.late_order_date'),
    false
  );
  perform set_config(
    'test.worker_delivery_date',
    current_setting('test.late_delivery_date'),
    false
  );
end;
$$;

select private.ensure_provider_lunch_day(
  'd9111111-1111-4111-8111-111111111111',
  current_setting('test.worker_order_date')::date
);

select private.ensure_provider_lunch_day(
  'd9222222-2222-4222-8222-222222222222',
  current_setting('test.worker_order_date')::date
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.create_hr_late_order(
      'd8222222-2222-4222-8222-222222222222',
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object(
              'menu_item_id',
              mi.id,
              'quantity',
              1
            )
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'd9111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.worker_order_date')::date
        limit 1
      ),
      null,
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'Setup automatic-provider late order'
);

select lives_ok(
  $$
    select public.create_hr_late_order(
      'd8222222-2222-4222-8222-222222222222',
      'd9222222-2222-4222-8222-222222222222',
      current_setting('test.worker_delivery_date')::date,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object(
              'menu_item_id',
              mi.id,
              'quantity',
              1
            )
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'd9222222-2222-4222-8222-222222222222'
          and ld.order_date = current_setting('test.worker_order_date')::date
        limit 1
      ),
      null,
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'Setup manual-provider late order'
);

reset role;
set local role authenticated;

select throws_ok(
  $$
    select public.worker_materialize_current_order_snapshots()
  $$,
  'permission denied for function worker_materialize_current_order_snapshots',
  'Worker snapshot RPC denied without effective service_role'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.worker_materialize_current_order_snapshots()
  $$,
  'permission denied for function worker_materialize_current_order_snapshots',
  'Worker snapshot RPC denied to Staff'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.worker_claim_automatic_provider_late_order_supplement(
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    )
  $$,
  'permission denied for function worker_claim_automatic_provider_late_order_supplement',
  'Automatic claim RPC denied to HR authenticated session'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$
    select public.worker_list_due_automatic_supplement_batches()
  $$,
  'permission denied for function worker_list_due_automatic_supplement_batches',
  'Automatic listing RPC denied to Accounts'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (select private.is_worker_service_caller()),
  'Effective service_role request context authorizes worker caller check'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  case
    when extract(isodow from current_setting('test.jamaica_today')::date) >= 6 then
      (
        select public.worker_materialize_current_order_snapshots() ->> 'skipped'
      ) = 'weekend'
    else
      (
        select (public.worker_materialize_current_order_snapshots() ->> 'materialized')::integer >= 1
      )
  end,
  'Worker snapshot materialization succeeds for effective service_role'
);

select ok(
  case
    when extract(isodow from current_setting('test.jamaica_today')::date) >= 6 then
      (
        select public.worker_materialize_current_order_snapshots() ->> 'skipped'
      ) = 'weekend'
    else (
      with first as (
        select count(*) as cnt
        from public.lunch_days
        where order_date = current_setting('test.jamaica_today')::date
      ),
      second as (
        select public.worker_materialize_current_order_snapshots()
      )
      select first.cnt = (
        select count(*)
        from public.lunch_days
        where order_date = current_setting('test.jamaica_today')::date
      )
      from first
    )
  end,
  'Current-day snapshot materialization is idempotent'
);

update public.lunch_providers
set late_order_deadline_day = 'delivery_day',
    late_order_deadline_time = '10:30:00',
    automatic_supplement_send_day = 'delivery_day',
    automatic_supplement_send_time = '10:00:00'
where id = 'd9111111-1111-4111-8111-111111111111';

select ok(
  not private.automatic_supplement_is_due(
    'd9111111-1111-4111-8111-111111111111',
    '2099-01-05'::date,
    '2099-01-06'::date,
    timestamptz '2099-01-06 09:30:00-05'
  ),
  'Automatic supplement is not due before configured send time'
);

select ok(
  private.automatic_supplement_is_due(
    'd9111111-1111-4111-8111-111111111111',
    '2099-01-05'::date,
    '2099-01-06'::date,
    timestamptz '2099-01-06 10:01:00-05'
  ),
  'Automatic supplement is due after send time and before deadline'
);

select ok(
  not private.automatic_supplement_is_due(
    'd9111111-1111-4111-8111-111111111111',
    '2099-01-05'::date,
    '2099-01-06'::date,
    timestamptz '2099-01-06 10:31:00-05'
  ),
  'Automatic supplement is not due after provider deadline'
);

select ok(
  not private.automatic_supplement_is_due(
    'd9222222-2222-4222-8222-222222222222',
    '2099-01-05'::date,
    '2099-01-06'::date,
    timestamptz '2099-01-06 10:01:00-05'
  ),
  'Manual provider is ignored by automatic due helper'
);

update public.lunch_providers
set automatic_supplement_send_day = 'order_day',
    automatic_supplement_send_time = '00:00:00',
    late_order_deadline_day = 'delivery_day',
    late_order_deadline_time = '23:59:00'
where id = 'd9111111-1111-4111-8111-111111111111';

select ok(
  jsonb_array_length(public.worker_list_due_automatic_supplement_batches()) >= 1,
  'Due automatic batches include providers with unsent late orders'
);

select ok(
  (
    select count(*)
    from jsonb_array_elements(public.worker_list_due_automatic_supplement_batches()) batch
    where (batch ->> 'provider_id') = 'd9222222-2222-4222-8222-222222222222'
  ) = 0,
  'Manual provider is excluded from due automatic batches'
);

select ok(
  (
    public.worker_claim_automatic_provider_late_order_supplement(
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    ) ->> 'action'
  ) = 'send',
  'Automatic worker creates the one allowed automatic send batch'
);

select lives_ok(
  $$
    select public.worker_finalize_provider_late_order_supplement(
      (
        select id
        from public.provider_late_order_dispatches
        where provider_id = 'd9111111-1111-4111-8111-111111111111'
          and status = 'pending'
        order by created_at desc
        limit 1
      ),
      true,
      null,
      jsonb_build_object('request_id', 'test-request-1')
    )
  $$,
  'Automatic worker finalize marks dispatch sent'
);

select results_eq(
  $$
    select count(*)
    from public.provider_late_order_dispatch_orders pldo
    join public.provider_late_order_dispatches pld on pld.id = pldo.dispatch_id
    where pld.provider_id = 'd9111111-1111-4111-8111-111111111111'
      and pld.status = 'sent'
  $$,
  array[1::bigint],
  'Successful automatic dispatch links order membership once'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.create_hr_late_order(
      'd8222222-2222-4222-8222-222222222222',
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date,
      (
        select jsonb_build_object(
          'standalone_items',
          jsonb_build_array(
            jsonb_build_object(
              'menu_item_id',
              mi.id,
              'quantity',
              1
            )
          )
        )
        from public.menu_items mi
        join public.lunch_days ld on ld.id = mi.lunch_day_id
        where ld.provider_id = 'd9111111-1111-4111-8111-111111111111'
          and ld.order_date = current_setting('test.worker_order_date')::date
        limit 1
      ),
      'Second batch order',
      (select id from public.office_locations order by name limit 1)
    )
  $$,
  'Create second automatic-provider late order after first dispatch'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$
    select public.worker_claim_automatic_provider_late_order_supplement(
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    )
  $$,
  'Automatic supplement opportunity already processed',
  'Later automatic worker runs do not send new late orders'
);

select ok(
  (
    select count(*)
    from jsonb_array_elements(public.worker_list_due_automatic_supplement_batches()) batch
    where batch ->> 'provider_id' = 'd9111111-1111-4111-8111-111111111111'
      and batch ->> 'scheduled_delivery_date' = current_setting('test.worker_delivery_date')::date::text
  ) = 0,
  'Processed automatic opportunity is excluded from due batches'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select ok(
  (
    public.claim_provider_late_order_supplement(
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    ) -> 'order_ids'
  ) is not null,
  'New late orders after automatic send remain manual-send candidates'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select public.worker_finalize_provider_late_order_supplement(
      (
        select id
        from public.provider_late_order_dispatches
        where provider_id = 'd9111111-1111-4111-8111-111111111111'
          and status = 'pending'
        order by created_at desc
        limit 1
      ),
      false,
      'Simulated SMTP failure'
    )
  $$,
  'Definite email failure leaves dispatch failed and orders unsent'
);

select ok(
  (
    select count(*)
    from public.provider_late_order_dispatch_orders pldo
    join public.provider_late_order_dispatches pld on pld.id = pldo.dispatch_id
    where pld.provider_id = 'd9111111-1111-4111-8111-111111111111'
      and pld.status = 'failed'
  ) = 0,
  'Failed automatic dispatch does not mark orders sent'
);

update public.provider_late_order_dispatches
set lease_expires_at = now() - interval '1 minute'
where provider_id = 'd9111111-1111-4111-8111-111111111111'
  and status = 'pending';

insert into public.provider_late_order_dispatches (
  provider_id,
  scheduled_delivery_date,
  dispatch_type,
  status,
  provider_email,
  message_metadata,
  lease_expires_at,
  worker_source
)
select
  'd9111111-1111-4111-8111-111111111111',
  current_setting('test.worker_delivery_date')::date,
  'automatic',
  'pending',
  'auto-kitchen@example.com',
  jsonb_build_object('order_ids', '[]'::jsonb),
  now() - interval '1 minute',
  'automatic_worker';

select ok(
  public.worker_sweep_stale_pending_dispatches() >= 1,
  'Stale pending dispatches are marked attention_required'
);

select throws_ok(
  $$
    select public.worker_claim_automatic_provider_late_order_supplement(
      'd9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    )
  $$,
  'Automatic supplement opportunity already processed',
  'Attention-required dispatch does not reopen automatic opportunity'
);

insert into public.provider_late_order_dispatches (
  provider_id,
  scheduled_delivery_date,
  dispatch_type,
  status,
  provider_email,
  message_metadata,
  lease_expires_at,
  worker_source
)
values (
  'd9111111-1111-4111-8111-111111111111',
  current_setting('test.worker_delivery_date')::date,
  'automatic',
  'pending',
  'auto-kitchen@example.com',
  jsonb_build_object(
    'order_ids',
    (
      select jsonb_agg(o.id)
      from public.orders o
      join public.lunch_days ld on ld.id = o.lunch_day_id
      where o.is_late_order = true
        and ld.provider_id = 'd9111111-1111-4111-8111-111111111111'
      limit 1
    )
  ),
  now() + interval '15 minutes',
  'automatic_worker'
);

select lives_ok(
  $$
    select public.worker_finalize_provider_late_order_supplement(
      (
        select id
        from public.provider_late_order_dispatches
        where provider_id = 'd9111111-1111-4111-8111-111111111111'
          and status = 'pending'
        order by created_at desc
        limit 1
      ),
      false,
      'Ambiguous provider response',
      null,
      true
    )
  $$,
  'Ambiguous dispatch finalize marks attention_required without sending orders'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

reset role;

insert into public.provider_late_order_dispatches (
  provider_id,
  scheduled_delivery_date,
  dispatch_type,
  status,
  provider_email,
  message_metadata,
  worker_source
)
values (
  'd9222222-2222-4222-8222-222222222222',
  current_setting('test.worker_delivery_date')::date,
  'manual',
  'attention_required',
  'manual-kitchen@example.com',
  jsonb_build_object(
    'order_ids',
    (
      select jsonb_agg(o.id)
      from public.orders o
      join public.lunch_days ld on ld.id = o.lunch_day_id
      where o.is_late_order = true
        and ld.provider_id = 'd9222222-2222-4222-8222-222222222222'
    )
  ),
  'manual_hr'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$
    select public.acknowledge_provider_late_order_dispatch_received(
      (
        select id
        from public.provider_late_order_dispatches
        where provider_id = 'd9222222-2222-4222-8222-222222222222'
          and status = 'attention_required'
        order by created_at desc
        limit 1
      )
    )
  $$,
  'HR can confirm provider received email without resending'
);

select ok(
  (
    select status
    from public.provider_late_order_dispatches
    where provider_id = 'd9222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  ) = 'sent',
  'Confirmed-received resolution finalizes dispatch without another SMTP call'
);

select lives_ok(
  $$
    select public.acknowledge_provider_late_order_dispatch_not_received(
      (
        select id
        from public.provider_late_order_dispatches
        where provider_id = 'd9111111-1111-4111-8111-111111111111'
          and status = 'attention_required'
        order by created_at desc
        limit 1
      )
    )
  $$,
  'HR can confirm not received and allow deliberate manual retry'
);

select ok(
  (
    select count(*)
    from public.provider_late_order_dispatch_reviews
    where resolution = 'confirmed_not_received'
  ) >= 1,
  'Not-received acknowledgement is audited'
);

update public.lunch_providers
set late_order_deadline_day = 'order_day',
    late_order_deadline_time = '00:00:00'
where id = 'd9222222-2222-4222-8222-222222222222';

select throws_ok(
  $$
    select public.claim_provider_late_order_supplement(
      'd9222222-2222-4222-8222-222222222222',
      current_setting('test.worker_delivery_date')::date
    )
  $$,
  'Provider late-order deadline has passed',
  'Manual Send Now respects provider late-order deadline'
);

reset role;

update public.lunch_providers
set automatic_supplement_send_day = 'delivery_day',
    automatic_supplement_send_time = '10:00:00',
    late_order_deadline_day = 'delivery_day',
    late_order_deadline_time = '10:30:00'
where id = 'd9111111-1111-4111-8111-111111111111';

select ok(
  not private.automatic_supplement_is_due(
    'd9111111-1111-4111-8111-111111111111',
    '2099-01-05'::date,
    '2099-01-06'::date,
    timestamptz '2099-01-05 17:30:00-05'
  ),
  'Delivery-day automatic send is not due on the order day before delivery send time'
);

update public.lunch_providers
set automatic_supplement_send_day = 'order_day',
    automatic_supplement_send_time = '17:00:00',
    late_order_deadline_day = 'order_day',
    late_order_deadline_time = '18:00:00'
where id = 'd9111111-1111-4111-8111-111111111111';

select ok(
  private.automatic_supplement_is_due(
    'd9111111-1111-4111-8111-111111111111',
    '2099-01-05'::date,
    '2099-01-06'::date,
    timestamptz '2099-01-05 17:30:00-05'
  ),
  'Order-day automatic send is due on the configured order day'
);

insert into public.lunch_providers (
  id, name, active, accepts_late_orders,
  late_order_deadline_day, late_order_deadline_time,
  supplemental_dispatch_mode, automatic_supplement_send_day,
  automatic_supplement_send_time, primary_order_email
)
values (
  'e9111111-1111-4111-8111-111111111111',
  'Worker Auto Empty',
  true, true, 'delivery_day', '23:59:00', 'automatic',
  'order_day', '00:00:00', 'empty-auto@example.com'
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values (
  'ea111111-1111-4111-8111-111111111111',
  'e9111111-1111-4111-8111-111111111111',
  'Empty Auto Main', 10.00, 'standalone', 'Each', true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'ea111111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  (
    public.worker_claim_automatic_provider_late_order_supplement(
      'e9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    ) ->> 'action'
  ) = 'no_orders',
  'Automatic opportunity with zero orders is recorded without sending email'
);

select ok(
  (
    select outcome
    from public.provider_late_order_automatic_opportunities
    where provider_id = 'e9111111-1111-4111-8111-111111111111'
      and scheduled_delivery_date = current_setting('test.worker_delivery_date')::date
  ) = 'no_orders',
  'Zero-order automatic opportunity is audited once'
);

select throws_ok(
  $$
    select public.worker_claim_automatic_provider_late_order_supplement(
      'e9111111-1111-4111-8111-111111111111',
      current_setting('test.worker_delivery_date')::date
    )
  $$,
  'Automatic supplement opportunity already processed',
  'Zero-order automatic opportunity is not retried every minute'
);

select * from finish();
rollback;
