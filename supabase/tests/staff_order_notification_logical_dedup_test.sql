begin;

select plan(23);

\ir support/isolate_existing_owner.inc
\ir support/submit_order_lunch_day_fixture.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ec111111-1111-4111-8111-111111111111', 'notify-dedup-staff@test.local', '{"full_name":"Dedup Staff"}'),
  ('ec222222-2222-4222-8222-222222222222', 'notify-dedup-hr@test.local', '{"full_name":"Dedup HR"}');

select private.apply_profile_role('ec111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('ec222222-2222-4222-8222-222222222222', 'hr');

\ir support/assign_test_office_defaults.inc

reset role;

create temp table dedup_item_payloads (label text primary key, payload jsonb not null);
insert into dedup_item_payloads values
  ('A', '{"meal_quantity": null, "main_menu_item_id": null, "side_menu_item_ids": [], "standalone_items": [{"menu_item_id": "20000000-0000-0000-0000-000000000001", "quantity": 1}]}'),
  ('B', '{"meal_quantity": null, "main_menu_item_id": null, "side_menu_item_ids": [], "standalone_items": [{"menu_item_id": "20000000-0000-0000-0000-000000000002", "quantity": 2}]}'),
  ('C', '{"meal_quantity": null, "main_menu_item_id": null, "side_menu_item_ids": [], "standalone_items": [{"menu_item_id": "20000000-0000-0000-0000-000000000003", "quantity": 1}]}');
grant select on dedup_item_payloads to authenticated;

create temp view dedup_staff_log as
select d.*
from private.notification_delivery_log d
where d.profile_id = 'ec111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.order_changed', true);
select public.submit_order(
  '10000000-0000-0000-0000-000000000001',
  (select payload from dedup_item_payloads where label = 'A')
);

reset role;
select set_config(
  'test.dedup_order_id',
  (select id::text from public.orders
   where profile_id = 'ec111111-1111-4111-8111-111111111111' and status = 'submitted'),
  true
);

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_submitted'),
  1,
  'Order submission queues one submitted email'
);

select private.notify_staff_order_event('staff.order_submitted', current_setting('test.dedup_order_id')::uuid);
select private.safe_notify_staff_order_event('staff.order_submitted', current_setting('test.dedup_order_id')::uuid);

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_submitted'),
  1,
  'Retried submitted notifications for the same order state are deduplicated'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.replace_order_items(
  current_setting('test.dedup_order_id')::uuid,
  (select payload from dedup_item_payloads where label = 'B'),
  null
);
reset role;

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_changed'),
  1,
  'First genuine edit queues an order changed email'
);

select private.notify_staff_order_event('staff.order_changed', current_setting('test.dedup_order_id')::uuid);
select private.notify_staff_order_event('staff.order_changed', current_setting('test.dedup_order_id')::uuid);

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_changed'),
  1,
  'Duplicate changed notifications for the same state are deduplicated'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.replace_order_items(
  current_setting('test.dedup_order_id')::uuid,
  (select payload from dedup_item_payloads where label = 'A'),
  null
);
select public.replace_order_items(
  current_setting('test.dedup_order_id')::uuid,
  (select payload from dedup_item_payloads where label = 'B'),
  null
);
reset role;

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_changed'),
  3,
  'Later edits that return to an earlier state (A to B to A to B) still notify each time'
);

select is(
  (select count(distinct idempotency_key)::integer from dedup_staff_log
   where order_id = current_setting('test.dedup_order_id')::uuid),
  (select count(*)::integer from dedup_staff_log
   where order_id = current_setting('test.dedup_order_id')::uuid),
  'Every queued staff order email has a distinct logical idempotency key'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.order_changed', false);
select public.replace_order_items(
  current_setting('test.dedup_order_id')::uuid,
  (select payload from dedup_item_payloads where label = 'C'),
  null
);
reset role;

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_changed'),
  3,
  'Opted-out order changed preference still suppresses the email'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.set_my_notification_preference('staff.order_changed', true);
select public.replace_order_items(
  current_setting('test.dedup_order_id')::uuid,
  (select payload from dedup_item_payloads where label = 'A'),
  null
);
reset role;

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_changed'),
  4,
  'Re-enabled preference notifies the next genuine edit'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.dedup_order_id')::uuid,
    (select payload from dedup_item_payloads where label = 'C'),
    'Kitchen ran out',
    (select updated_at from public.orders where id = current_setting('test.dedup_order_id')::uuid)
  ) $$,
  'HR modifies the staff order'
);

reset role;

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.changed_by_hr'),
  1,
  'HR modification still notifies the employee'
);

select private.notify_staff_order_event('staff.changed_by_hr', current_setting('test.dedup_order_id')::uuid);

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.changed_by_hr'),
  1,
  'Retried HR modification notification is deduplicated'
);

select private.notify_staff_order_event('staff.order_changed', current_setting('test.dedup_order_id')::uuid);
select private.notify_staff_order_event('staff.order_submitted', current_setting('test.dedup_order_id')::uuid);

select is(
  (select count(*)::integer from dedup_staff_log
   where order_id = current_setting('test.dedup_order_id')::uuid),
  6,
  'Older staff events retried after the HR modification send nothing'
);

select is(
  (select r.event_key from private.order_notification_state_revisions r
   where r.order_id = current_setting('test.dedup_order_id')::uuid
   order by r.revision desc limit 1),
  'staff.changed_by_hr',
  'Current order state revision belongs to the HR modification'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hr_modify_staff_order(
    current_setting('test.dedup_order_id')::uuid,
    (select payload from dedup_item_payloads where label = 'B'),
    'Second HR adjustment',
    (select updated_at from public.orders where id = current_setting('test.dedup_order_id')::uuid)
  ) $$,
  'HR modifies the staff order again'
);

reset role;

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.changed_by_hr'),
  2,
  'A later genuine HR modification is not suppressed'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ec111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.cancel_order(current_setting('test.dedup_order_id')::uuid);
reset role;

select private.notify_staff_order_event('staff.order_cancelled', current_setting('test.dedup_order_id')::uuid);

select is(
  (select count(*)::integer from dedup_staff_log where event_key = 'staff.order_cancelled'),
  1,
  'Cancellation notifies once even when the notification is retried'
);

select is(
  (select count(*)::integer from private.order_notification_lifecycle nl
   where nl.order_id = current_setting('test.dedup_order_id')::uuid),
  (select count(*)::integer from dedup_staff_log
   where order_id = current_setting('test.dedup_order_id')::uuid),
  'One lifecycle row per queued email; deduplicated retries record no lifecycle row'
);

select is(
  (select array_agg(r.revision order by r.revision)
   from private.order_notification_state_revisions r
   where r.order_id = current_setting('test.dedup_order_id')::uuid),
  (select array_agg(g order by g) from generate_series(1, 9) g),
  'Each distinct order state reached is one contiguous revision (9 states)'
);

select ok(
  exists (
    select 1
    from private.order_notification_state_revisions r
    where r.order_id = current_setting('test.dedup_order_id')::uuid
      and r.event_key = 'staff.order_changed'
      and not exists (
        select 1 from private.order_notification_lifecycle nl
        where nl.order_id = r.order_id and nl.state_revision = r.revision
      )
  ),
  'A preference-suppressed change is still recorded as a revision without an email'
);

select is(
  (select array_agg(d.idempotency_key order by d.idempotency_key) from dedup_staff_log d
   where d.order_id = current_setting('test.dedup_order_id')::uuid),
  (select array_agg(
            'staff.order_event:' || nl.order_id::text || ':revision:' || nl.state_revision::text
            order by 'staff.order_event:' || nl.order_id::text || ':revision:' || nl.state_revision::text)
   from private.order_notification_lifecycle nl
   where nl.order_id = current_setting('test.dedup_order_id')::uuid),
  'Every staff order email is keyed on its order state revision'
);

select throws_ok(
  $$ insert into private.order_notification_lifecycle (order_id, event_key, state_revision)
     values (current_setting('test.dedup_order_id')::uuid, 'staff.order_changed', 2) $$,
  '23505',
  null,
  'Database rejects a second notification for the same order state revision'
);

select throws_ok(
  $$ insert into private.order_notification_state_revisions (order_id, revision, state_fingerprint)
     values (current_setting('test.dedup_order_id')::uuid, 2, 'x') $$,
  '23505',
  null,
  'Database rejects a duplicate order state revision'
);

select is(
  (select count(*)::integer
   from private.notification_delivery_batch b
   where b.event_key like 'staff.%'
     and not exists (
       select 1 from private.notification_delivery_log d where d.batch_id = b.id
     )),
  0,
  'Deduplicated calls leave no orphan delivery batches'
);

select * from finish();
rollback;
