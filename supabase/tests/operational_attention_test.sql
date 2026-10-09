begin;

select plan(30);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b0111111-1111-4111-8111-111111111111', 'oa-staff@test.local', '{"full_name":"OA Staff"}'),
  ('b0222222-2222-4222-8222-222222222222', 'oa-hr@test.local', '{"full_name":"OA HR"}'),
  ('b0333333-3333-4333-8333-333333333333', 'oa-accounts@test.local', '{"full_name":"OA Accounts"}'),
  ('b0444444-4444-4444-8444-444444444444', 'oa-admin@test.local', '{"full_name":"OA Admin"}'),
  ('b0555555-5555-4555-8555-555555555555', 'oa-owner@test.local', '{"full_name":"OA Owner"}'),
  ('b0666666-6666-4666-8666-666666666666', 'oa-hr-two@test.local', '{"full_name":"OA HR Two"}');

reset role;
select private.apply_profile_role('b0111111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('b0222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('b0333333-3333-4333-8333-333333333333', 'accounts');
select private.apply_profile_role('b0444444-4444-4444-8444-444444444444', 'admin');
select private.apply_profile_role('b0555555-5555-4555-8555-555555555555', 'owner');
select private.apply_profile_role('b0666666-6666-4666-8666-666666666666', 'hr');

insert into private.signup_email_domains (domain, active)
values ('example.test', true)
on conflict (domain) do update set active = true;

set local role anon;
select is(
  (public.request_external_signup('OA Applicant', 'oa-applicant@gmail.com') ->> 'code'),
  'submitted',
  'signup request created for attention tests'
);
reset role;

select set_config(
  'test.oa_signup_request_id',
  (
    select sr.id::text
    from private.signup_requests sr
    where sr.email = 'oa-applicant@gmail.com'
    order by sr.requested_at desc
    limit 1
  ),
  false
);

select set_config(
  'test.oa_hr_item_id',
  private.create_operational_attention_item(
    'b0222222-2222-4222-8222-222222222222'::uuid,
    'hr.pending_signup_approval'::text,
    'Pending user approval'::text,
    'A user is waiting for approval.'::text,
    '/admin/users?view=approvals'::text,
    ('hr.pending_signup_approval:' || current_setting('test.oa_signup_request_id') || ':b0222222-2222-4222-8222-222222222222')::text,
    p_signup_request_id => current_setting('test.oa_signup_request_id')::uuid
  )::text,
  false
);

do $$
declare
  v_id uuid;
begin
  insert into private.email_delivery_queue (
    message_type, recipient_email, subject, text_body, html_body,
    status, attempts, available_at
  ) values (
    'notification_test', 'oa-admin-fail@test.local', 'S', 't', '<p>h</p>', 'failed', 5, now()
  ) returning id into v_id;
  perform set_config('test.oa_admin_queue_id', v_id::text, false);
end;
$$;

select set_config(
  'test.oa_admin_item_id',
  private.create_operational_attention_item(
    'b0444444-4444-4444-8444-444444444444'::uuid,
    'admin.email_delivery_failure'::text,
    'Email delivery failed'::text,
    'An application email could not be delivered.'::text,
    '/admin/settings/email/delivery/history'::text,
    ('admin.email_delivery_failure:' || current_setting('test.oa_admin_queue_id') || ':b0444444-4444-4444-8444-444444444444')::text,
    p_failed_email_queue_id => current_setting('test.oa_admin_queue_id')::uuid
  )::text,
  false
);

-- Staff and Accounts cannot access inbox RPCs
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b0111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.list_my_operational_attention_items() $$,
  'Operational attention inbox access required',
  'Staff cannot list operational attention items'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b0333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.count_my_unread_operational_attention_items() $$,
  'Operational attention inbox access required',
  'Accounts cannot count unread operational attention items'
);

-- HR sees only own items
select set_config('request.jwt.claims', json_build_object('sub', 'b0222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.list_my_operational_attention_items()),
  1,
  'HR lists one active item'
);

select is(
  public.count_my_unread_operational_attention_items(),
  1::bigint,
  'HR unread count is one'
);

select is(
  public.mark_operational_attention_item_read(current_setting('test.oa_hr_item_id')::uuid),
  true,
  'HR can mark own item read'
);

select is(
  public.count_my_unread_operational_attention_items(),
  0::bigint,
  'Unread count drops after mark read'
);

-- HR cannot mark admin item
select is(
  public.mark_operational_attention_item_read(current_setting('test.oa_admin_item_id')::uuid),
  false,
  'HR cannot mark another user item read'
);

-- Admin sees admin item only (not HR inbox)
select set_config('request.jwt.claims', json_build_object('sub', 'b0444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::integer from public.list_my_operational_attention_items()),
  1,
  'Admin lists one active admin item'
);

select is(
  (select event_key from public.list_my_operational_attention_items() limit 1),
  'admin.email_delivery_failure',
  'Admin item is technical delivery failure'
);

-- Support Mode does not reassign inbox ownership
select lives_ok(
  $$ select * from public.start_support_session('hr', 'oa support isolation') $$,
  'Admin starts HR support session'
);

select is(
  (select count(*)::integer from public.list_my_operational_attention_items()),
  1,
  'Support Mode admin still sees only own operational attention items'
);

select is(
  (select count(*)::integer
   from public.list_my_operational_attention_items()
   where event_key = 'hr.pending_signup_approval'),
  0,
  'Support Mode does not expose HR recipient inbox'
);

select lives_ok(
  $$ select public.end_support_session() $$,
  'Admin ends support session'
);

-- Mark all read (HR)
reset role;

select set_config(
  'test.oa_hr_two_item_id',
  private.create_operational_attention_item(
    'b0666666-6666-4666-8666-666666666666'::uuid,
    'hr.pending_signup_approval'::text,
    'Pending user approval'::text,
    'Another pending approval.'::text,
    '/admin/users?view=approvals'::text,
    ('hr.pending_signup_approval:' || current_setting('test.oa_signup_request_id') || ':b0666666-6666-4666-8666-666666666666')::text,
    p_signup_request_id => current_setting('test.oa_signup_request_id')::uuid
  )::text,
  false
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b0666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);

select is(
  public.mark_all_my_operational_attention_items_read(),
  1,
  'Mark all read updates unread active items for caller'
);

-- Idempotency under duplicate create
reset role;

select is(
  private.create_operational_attention_item(
    'b0666666-6666-4666-8666-666666666666'::uuid,
    'hr.pending_signup_approval'::text,
    'Pending user approval'::text,
    'Duplicate create attempt.'::text,
    '/admin/users?view=approvals'::text,
    ('hr.pending_signup_approval:' || current_setting('test.oa_signup_request_id') || ':b0666666-6666-4666-8666-666666666666')::text,
    p_signup_request_id => current_setting('test.oa_signup_request_id')::uuid
  ),
  current_setting('test.oa_hr_two_item_id')::uuid,
  'Duplicate idempotency key returns existing item id'
);

select is(
  (
    select count(*)::integer
    from private.operational_attention_items o
    where o.idempotency_key =
      'hr.pending_signup_approval:' || current_setting('test.oa_signup_request_id') || ':b0666666-6666-4666-8666-666666666666'
  ),
  1,
  'Concurrent duplicate create leaves one row'
);

-- Invalid href and recipient/event mismatch
select throws_ok(
  $$ select private.create_operational_attention_item(
    'b0222222-2222-4222-8222-222222222222',
    'hr.pending_signup_approval',
    'Bad link',
    'Body',
    '/admin/late-orders',
    'hr.pending_signup_approval:bad-href:hr',
    current_setting('test.oa_signup_request_id')::uuid
  ) $$,
  'Invalid action_href for event hr.pending_signup_approval',
  'Signup approval requires users path'
);

select throws_ok(
  $$ select private.create_operational_attention_item(
    'b0444444-4444-4444-8444-444444444444',
    'hr.pending_signup_approval',
    'Wrong role',
    'Body',
    '/admin/users?view=approvals',
    'hr.pending_signup_approval:wrong-role:admin',
    current_setting('test.oa_signup_request_id')::uuid
  ) $$,
  'Recipient is not eligible for event hr.pending_signup_approval',
  'Admin cannot receive HR operational attention item'
);

-- Idempotency key cannot return another recipient item
reset role;

select throws_ok(
  $$ select private.create_operational_attention_item(
    'b0666666-6666-4666-8666-666666666666'::uuid,
    'hr.pending_signup_approval'::text,
    'Wrong recipient reuse'::text,
    'Body'::text,
    '/admin/users?view=approvals'::text,
    ('hr.pending_signup_approval:' || current_setting('test.oa_signup_request_id') || ':b0222222-2222-4222-8222-222222222222')::text,
    p_signup_request_id => current_setting('test.oa_signup_request_id')::uuid
  ) $$,
  'Idempotency key already used for a different recipient',
  'Duplicate idempotency key for another HR user is rejected'
);

-- Cleared entity reference resolves attention (no stale actionable row)
select set_config(
  'test.oa_entity_clear_item_id',
  private.create_operational_attention_item(
    'b0222222-2222-4222-8222-222222222222'::uuid,
    'hr.pending_signup_approval'::text,
    'Entity clear test'::text,
    'Will resolve when signup ref clears.'::text,
    '/admin/users?view=approvals'::text,
    ('hr.pending_signup_approval:entity-clear:' || current_setting('test.oa_signup_request_id'))::text,
    p_signup_request_id => current_setting('test.oa_signup_request_id')::uuid
  )::text,
  false
);

update private.operational_attention_items
set signup_request_id = null
where id = current_setting('test.oa_entity_clear_item_id')::uuid;

select ok(
  (
    select o.resolved_at is not null
    from private.operational_attention_items o
    where o.id = current_setting('test.oa_entity_clear_item_id')::uuid
  ),
  'Clearing signup reference auto-resolves attention item'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b0222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (
    select count(*)::integer
    from public.list_my_operational_attention_items()
    where id = current_setting('test.oa_entity_clear_item_id')::uuid
  ),
  0,
  'Auto-resolved item is excluded from active inbox list'
);

-- Resolution removes from active list
reset role;
select is(
  private.resolve_operational_attention_for_signup_request(
    current_setting('test.oa_signup_request_id')::uuid
  ) >= 2,
  true,
  'Resolve signup clears attention rows for signup request'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b0222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_operational_attention_items()),
  0,
  'Resolved items no longer appear in active list'
);

-- Age-based expiry in list (not yet purged)
reset role;
select set_config(
  'test.oa_stale_item_id',
  private.create_operational_attention_item(
    'b0555555-5555-4555-8555-555555555555'::uuid,
    'admin.email_delivery_failure'::text,
    'Stale failure'::text,
    'Old item.'::text,
    '/admin/settings/email/delivery/history'::text,
    ('admin.email_delivery_failure:stale:' || gen_random_uuid()::text)::text,
    p_failed_email_queue_id => current_setting('test.oa_admin_queue_id')::uuid
  )::text,
  false
);

update private.operational_attention_items
set created_at = now() - interval '8 days'
where id = current_setting('test.oa_stale_item_id')::uuid;

select set_config('request.jwt.claims', json_build_object('sub', 'b0555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_operational_attention_items()),
  0,
  'Items older than retention window are excluded from active list'
);

-- Purge worker deletes expired rows only
reset role;
select set_config(
  'test.oa_delivery_log_before',
  (select count(*)::text from private.notification_delivery_log),
  false
);

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);

select ok(
  public.worker_purge_expired_operational_attention_items() >= 1,
  'Purge worker deletes expired operational attention rows'
);

reset role;

select ok(
  not exists (
    select 1
    from private.operational_attention_items o
    where o.id = current_setting('test.oa_stale_item_id')::uuid
  ),
  'Stale operational attention row removed by purge'
);

select is(
  (select count(*)::integer from private.notification_delivery_log),
  current_setting('test.oa_delivery_log_before')::integer,
  'Purge does not modify notification delivery log'
);

select ok(
  exists (
    select 1
    from private.signup_requests sr
    where sr.id = current_setting('test.oa_signup_request_id')::uuid
  ),
  'Purge does not delete underlying signup request'
);

select ok(
  exists (
    select 1
    from private.email_delivery_queue q
    where q.id = current_setting('test.oa_admin_queue_id')::uuid
  ),
  'Purge does not delete email delivery queue row'
);

select * from finish();
rollback;
