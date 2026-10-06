begin;
select plan(5);

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
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  'Noon Cap Test Provider',
  true,
  true,
  'delivery_day',
  '11:59:00',
  'manual',
  'noon-cap-test@example.com'
)
on conflict (id) do update set
  accepts_late_orders = excluded.accepts_late_orders,
  late_order_deadline_day = excluded.late_order_deadline_day,
  late_order_deadline_time = excluded.late_order_deadline_time,
  primary_order_email = excluded.primary_order_email;

select lives_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_time = '12:00:00'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
  $$,
  'delivery-day cutoff at 12:00 PM is allowed'
);

select throws_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_time = '12:01:00'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
  $$,
  'The late-order cutoff cannot be later than 12:00 PM on the delivery date.',
  'delivery-day cutoff after noon is rejected'
);

select lives_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_day = 'order_day',
        late_order_deadline_time = '18:00:00'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
  $$,
  'previous-day cutoff is unaffected by noon cap'
);

select lives_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_day = 'delivery_day',
        late_order_deadline_time = '09:30:00'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
  $$,
  'delivery-day cutoff before noon remains allowed'
);

select throws_ok(
  $$
    update public.lunch_providers
    set late_order_deadline_time = '23:59:00'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
  $$,
  'The late-order cutoff cannot be later than 12:00 PM on the delivery date.',
  'late evening delivery-day cutoff is rejected'
);

select * from finish();
rollback;
