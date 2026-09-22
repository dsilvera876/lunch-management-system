begin;

select plan(4);

insert into public.lunch_providers (id, name, active)
values (
  'f9111111-1111-4111-8111-111111111111',
  'Snapshot Menu Provider',
  true
);

insert into public.provider_menu_items (id, provider_id, name, price, item_type, unit_label, active)
values (
  'fa111111-1111-4111-8111-111111111111',
  'f9111111-1111-4111-8111-111111111111',
  'Original Snapshot Name',
  10.00,
  'standalone',
  'Each',
  true
);

insert into public.provider_menu_item_weekdays (provider_menu_item_id, weekday)
select 'fa111111-1111-4111-8111-111111111111'::uuid, weekday
from generate_series(1, 5) as weekday;

insert into public.lunch_providers (
  id,
  name,
  active,
  accepts_late_orders,
  late_order_deadline_day,
  late_order_deadline_time,
  supplemental_dispatch_mode,
  primary_order_email
)
values (
  'b1111111-1111-4111-8111-111111111111',
  'Snapshot Late Provider',
  true,
  true,
  'delivery_day',
  '23:59:00',
  'manual',
  'snapshot-late@example.com'
)
on conflict (id) do update
set
  accepts_late_orders = excluded.accepts_late_orders,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time;

\ir support/open_ordering.inc
\ir support/late_order_cycle.inc

do $$
declare
  v_snapshot_date date := current_setting('test.jamaica_today')::date;
begin
  perform set_config('test.snapshot_order_date', v_snapshot_date::text, false);

  delete from public.menu_items
  where lunch_day_id in (
    select id
    from public.lunch_days
    where provider_id = 'f9111111-1111-4111-8111-111111111111'
      and order_date = v_snapshot_date
  );

  delete from public.lunch_days
  where provider_id = 'f9111111-1111-4111-8111-111111111111'
    and order_date = v_snapshot_date;
end;
$$;

select ok(
  (
    select count(*)
    from public.lunch_days
    where provider_id = 'f9111111-1111-4111-8111-111111111111'
      and order_date = current_setting('test.snapshot_order_date')::date
  ) = 0,
  'Current-day snapshot does not exist before recurring-menu edit'
);

update public.provider_menu_items
set name = 'Edited Recurring Name'
where id = 'fa111111-1111-4111-8111-111111111111';

select ok(
  extract(isodow from current_setting('test.jamaica_today')::date) >= 6
  or (
    select count(*)
    from public.lunch_days
    where provider_id = 'f9111111-1111-4111-8111-111111111111'
      and order_date = current_setting('test.snapshot_order_date')::date
  ) = 1,
  'Current-day snapshot is materialized before same-day recurring-menu mutation'
);

select ok(
  extract(isodow from current_setting('test.jamaica_today')::date) >= 6
  or (
    select mi.name
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where ld.provider_id = 'f9111111-1111-4111-8111-111111111111'
      and ld.order_date = current_setting('test.snapshot_order_date')::date
    order by mi.name
    limit 1
  ) = 'Original Snapshot Name',
  'Frozen snapshot keeps the pre-edit recurring menu name'
);

update public.provider_menu_items
set name = 'Later Edit Attempt'
where id = 'fa111111-1111-4111-8111-111111111111';

select ok(
  extract(isodow from current_setting('test.jamaica_today')::date) >= 6
  or (
    select mi.name
    from public.menu_items mi
    join public.lunch_days ld on ld.id = mi.lunch_day_id
    where ld.provider_id = 'f9111111-1111-4111-8111-111111111111'
      and ld.order_date = current_setting('test.snapshot_order_date')::date
    order by mi.name
    limit 1
  ) = 'Original Snapshot Name',
  'Existing snapshot is never rebuilt by later recurring-menu edits'
);

select * from finish();
rollback;
