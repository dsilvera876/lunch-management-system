begin;

select plan(8);

\ir support/reset_app_settings_baseline.inc
\ir support/isolate_lunch_periods.inc

insert into public.lunch_providers (id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, primary_order_email)
values (
  'ed111111-1111-4111-8111-111111111111',
  'LOCL Late Provider',
  true,
  true,
  'delivery_day',
  '12:00:00',
  'manual',
  'locl-kitchen@example.com'
)
on conflict (id) do update set
  active = true,
  accepts_late_orders = true,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time,
  primary_order_email = excluded.primary_order_email;

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values (
  'ed811111-1111-4111-8111-111111111111',
  'ed111111-1111-4111-8111-111111111111',
  'LOCL Late Main',
  10.00,
  'standalone',
  'Each',
  true
)
on conflict (id) do nothing;

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'ed811111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday
on conflict do nothing;

\ir support/late_order_cycle.inc

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ed211111-1111-4111-8111-111111111111', 'locl-staff@test.local', '{"full_name":"LOCL Staff"}'),
  ('ed222222-2222-4222-8222-222222222222', 'locl-hr@test.local', '{"full_name":"LOCL HR"}'),
  ('ed233333-3333-4333-8333-333333333333', 'locl-late@test.local', '{"full_name":"LOCL Late"}'),
  ('ed244444-4444-4444-8444-444444444444', 'locl-direct@test.local', '{"full_name":"LOCL Direct"}');

reset role;
select private.apply_profile_role('ed211111-1111-4111-8111-111111111111', 'staff');
select private.apply_profile_role('ed222222-2222-4222-8222-222222222222', 'hr');
select private.apply_profile_role('ed233333-3333-4333-8333-333333333333', 'staff');
select private.apply_profile_role('ed244444-4444-4444-8444-444444444444', 'staff');

insert into public.office_locations (id, name, is_active)
values ('ed900000-0000-4000-8000-000000000001', 'LOCL Office', true)
on conflict (id) do nothing;

select private.ensure_provider_lunch_day(
  'ed111111-1111-4111-8111-111111111111',
  current_setting('test.late_order_date')::date
);

create temp view locl_cycle_share_locks as
select count(distinct l.objid)::integer as locked_dates
from pg_locks l
where l.locktype = 'advisory'
  and l.mode = 'ShareLock'
  and l.pid = pg_backend_pid()
  and l.granted
  and ((l.classid::bigint << 32) | l.objid::bigint) in (
    private.business_calendar_date_lock_key(current_setting('test.late_order_date')::date),
    private.business_calendar_date_lock_key(current_setting('test.late_delivery_date')::date)
  );

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ed211111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select public.set_my_default_office_location('ed900000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims', json_build_object('sub', 'ed233333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
select public.set_my_default_office_location('ed900000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims', json_build_object('sub', 'ed244444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select public.set_my_default_office_location('ed900000-0000-4000-8000-000000000001');
reset role;

select is(
  (select locked_dates from locl_cycle_share_locks),
  0,
  'No calendar date locks are held before any late-order creation'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ed211111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.create_staff_late_order_request(
    'ed111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Lunch please',
    1,
    null
  ) $$,
  'Staff creates a late-order request on an open cycle'
);

reset role;

select is(
  (select locked_dates from locl_cycle_share_locks),
  case
    when current_setting('test.late_order_date') = current_setting('test.late_delivery_date') then 1
    else 2
  end,
  'Staff request creation holds shared locks on its order and delivery dates'
);

select ok(
  not exists (
    select 1
    from generate_series(
      current_setting('test.late_order_date')::date,
      current_setting('test.late_delivery_date')::date,
      interval '1 day'
    ) d
    where not exists (
      select 1 from pg_locks l
      where l.locktype = 'advisory' and l.mode = 'ShareLock' and l.pid = pg_backend_pid()
        and ((l.classid::bigint << 32) | l.objid::bigint)
            = private.business_calendar_date_lock_key(d::date)
    )
  ),
  'Every date from the order date through the delivery date is share-locked'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ed222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.upsert_manual_business_calendar_entry(
    null,
    current_setting('test.late_delivery_date')::date,
    'company_closure',
    'global',
    null,
    'LOCL closure',
    null,
    true
  ) $$,
  'HR closes the delivery date with acknowledgment'
);

reset role;

select is(
  (select r.status from private.staff_late_order_requests r
   where r.requester_profile_id = 'ed211111-1111-4111-8111-111111111111'),
  'declined',
  'The request created before the closure is automatically declined'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'ed233333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.create_staff_late_order_request(
    'ed111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    'Lunch please',
    1,
    null
  ) $$,
  'Invalid delivery date',
  'Staff late-order request for the closed delivery date is rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', 'ed222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.create_hr_late_order(
    'ed244444-4444-4444-8444-444444444444',
    'ed111111-1111-4111-8111-111111111111',
    current_setting('test.late_delivery_date')::date,
    (select jsonb_build_object(
       'standalone_items',
       jsonb_build_array(jsonb_build_object('menu_item_id', mi.id, 'quantity', 1)))
     from public.menu_items mi
     join public.lunch_days ld on ld.id = mi.lunch_day_id
     where ld.provider_id = 'ed111111-1111-4111-8111-111111111111'
       and ld.order_date = current_setting('test.late_order_date')::date
     limit 1),
    null,
    'ed900000-0000-4000-8000-000000000001'
  ) $$,
  'Invalid delivery date',
  'Direct HR late order for the closed delivery date is rejected'
);

reset role;

select * from finish();
rollback;
