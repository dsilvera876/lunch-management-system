begin;

select plan(13);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.wait_for_advisory_lock(
  p_lock_key bigint,
  p_timeout interval default interval '5 seconds'
)
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    if not pg_try_advisory_lock(p_lock_key) then
      return true;
    end if;
    perform pg_advisory_unlock(p_lock_key);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  return false;
end;
$$;

create or replace function pg_temp.wait_for_dblink(
  p_connection_name text,
  p_timeout interval default interval '5 seconds'
)
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    if extensions.dblink_is_busy(p_connection_name) = 0 then
      return true;
    end if;
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  return false;
end;
$$;

select extensions.dblink_connect(
  'my_orders_reader',
  'host=supabase_db_lunch-management-system port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'my_orders_writer',
  'host=supabase_db_lunch-management-system port=5432 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_exec(
  'my_orders_writer',
  $setup$
    delete from public.orders
    where profile_id = 'bb000001-0000-4000-8000-000000000001';
    delete from auth.users
    where id = 'bb000001-0000-4000-8000-000000000001';
    delete from public.lunch_days
    where id = 'bb000010-0000-4000-8000-000000000010';
    delete from public.lunch_providers
    where id = 'bb000020-0000-4000-8000-000000000020';

    insert into auth.users (id, email, raw_user_meta_data)
    values (
      'bb000001-0000-4000-8000-000000000001',
      'snapshot-concurrency@test.local',
      '{"full_name":"Snapshot Concurrency"}'
    );

    insert into public.lunch_providers (id, name, active, primary_order_email)
    values (
      'bb000020-0000-4000-8000-000000000020',
      'Snapshot Concurrency Provider',
      true,
      'snapshot-concurrency-provider@example.test'
    );

    insert into public.lunch_days (
      id,
      lunch_date,
      order_date,
      provider_id,
      order_deadline,
      status
    )
    values (
      'bb000010-0000-4000-8000-000000000010',
      '2099-01-07',
      '2099-01-05',
      'bb000020-0000-4000-8000-000000000020',
      '2099-01-05 23:59:00+00',
      'open'
    );

    insert into public.menu_items (
      id,
      lunch_day_id,
      name,
      price,
      item_type,
      unit_label,
      is_active
    )
    values (
      'bb000030-0000-4000-8000-000000000030',
      'bb000010-0000-4000-8000-000000000010',
      'Snapshot Meal',
      25,
      'standalone',
      'Each',
      true
    );

    insert into public.orders (
      id,
      profile_id,
      lunch_day_id,
      status,
      financial_disposition,
      order_group_id,
      created_at,
      updated_at
    )
    values
      (
        'bb000101-0000-4000-8000-000000000101',
        'bb000001-0000-4000-8000-000000000001',
        'bb000010-0000-4000-8000-000000000010',
        'submitted',
        'chargeable',
        'bb000201-0000-4000-8000-000000000201',
        '2099-01-05 10:00:00+00',
        '2099-01-05 10:00:00+00'
      ),
      (
        'bb000102-0000-4000-8000-000000000102',
        'bb000001-0000-4000-8000-000000000001',
        'bb000010-0000-4000-8000-000000000010',
        'submitted',
        'chargeable',
        'bb000202-0000-4000-8000-000000000202',
        '2099-01-05 11:00:00+00',
        '2099-01-05 11:00:00+00'
      );

    insert into public.order_items (order_id, menu_item_id, quantity)
    values
      (
        'bb000101-0000-4000-8000-000000000101',
        'bb000030-0000-4000-8000-000000000030',
        1
      ),
      (
        'bb000102-0000-4000-8000-000000000102',
        'bb000030-0000-4000-8000-000000000030',
        1
      );

    update public.orders
    set status = 'fulfilled'
    where profile_id = 'bb000001-0000-4000-8000-000000000001';
  $setup$
);

select extensions.dblink_exec(
  'my_orders_reader',
  $$
    set request.jwt.claims =
      '{"sub":"bb000001-0000-4000-8000-000000000001","role":"authenticated"}'
  $$
);

select pg_advisory_lock(73202312001);

select ok(
  extensions.dblink_send_query(
    'my_orders_reader',
    $snapshot$
      with started as materialized (
        select pg_advisory_xact_lock(73202312002)
      ),
      release_barrier as materialized (
        select pg_advisory_xact_lock(73202312001)
        from started
      )
      select public.get_my_orders_snapshot()::text
      from release_barrier
    $snapshot$
  ) = 1,
  'the snapshot read starts asynchronously in an independent session'
);

select ok(
  pg_temp.wait_for_advisory_lock(73202312002),
  'the reader statement establishes its snapshot before concurrent changes'
);

select is(
  extensions.dblink_exec(
    'my_orders_writer',
    $change$
      update public.orders
      set status = 'cancelled'
      where id = 'bb000101-0000-4000-8000-000000000101';

      insert into public.orders (
        id,
        profile_id,
        lunch_day_id,
        status,
        financial_disposition,
        order_group_id,
        created_at,
        updated_at
      )
      values (
        'bb000103-0000-4000-8000-000000000103',
        'bb000001-0000-4000-8000-000000000001',
        'bb000010-0000-4000-8000-000000000010',
        'submitted',
        'chargeable',
        'bb000203-0000-4000-8000-000000000203',
        '2099-01-05 12:00:00+00',
        '2099-01-05 12:00:00+00'
      );

      insert into public.order_items (order_id, menu_item_id, quantity)
      values (
        'bb000103-0000-4000-8000-000000000103',
        'bb000030-0000-4000-8000-000000000030',
        1
      );

      update public.orders
      set status = 'fulfilled'
      where id = 'bb000103-0000-4000-8000-000000000103';
    $change$
  ),
  'UPDATE 1',
  'a concurrent cancellation and checkout insertion commit independently'
);

select is(
  extensions.dblink_is_busy('my_orders_reader'),
  1,
  'the original snapshot remains in flight during the committed changes'
);

select ok(pg_advisory_unlock(73202312001), 'the snapshot release barrier is removed');

select ok(
  pg_temp.wait_for_dblink('my_orders_reader'),
  'the original snapshot completes after the barrier is removed'
);

create temporary table original_snapshot (payload jsonb) on commit drop;
insert into original_snapshot (payload)
select value::jsonb
from extensions.dblink_get_result('my_orders_reader') as result(value text);

select is(
  (select jsonb_array_length(payload -> 'orders') from original_snapshot),
  2,
  'the in-flight read contains the complete pre-change order set'
);

select is(
  (
    select item ->> 'status'
    from original_snapshot snapshot
    cross join lateral jsonb_array_elements(snapshot.payload -> 'orders') item
    where item ->> 'id' = 'bb000101-0000-4000-8000-000000000101'
  ),
  'fulfilled',
  'the in-flight read does not mix in the concurrent cancellation'
);

select is(
  (
    select count(*)::integer
    from original_snapshot snapshot
    cross join lateral jsonb_array_elements(snapshot.payload -> 'orders') item
    where item ->> 'id' = 'bb000103-0000-4000-8000-000000000103'
  ),
  0,
  'the in-flight read does not mix in the concurrent insertion'
);

create temporary table fresh_snapshot (payload jsonb) on commit drop;
select extensions.dblink_exec(
  'my_orders_writer',
  $$
    set request.jwt.claims =
      '{"sub":"bb000001-0000-4000-8000-000000000001","role":"authenticated"}'
  $$
);
insert into fresh_snapshot (payload)
select value::jsonb
from extensions.dblink(
  'my_orders_writer',
  $$ select public.get_my_orders_snapshot()::text $$
) as result(value text);

select is(
  (select jsonb_array_length(payload -> 'orders') from fresh_snapshot),
  3,
  'a later snapshot sees the newly committed checkout without omission'
);

select is(
  (
    select item ->> 'status'
    from fresh_snapshot snapshot
    cross join lateral jsonb_array_elements(snapshot.payload -> 'orders') item
    where item ->> 'id' = 'bb000101-0000-4000-8000-000000000101'
  ),
  'cancelled',
  'a later snapshot sees the committed cancellation'
);

select is(
  (select payload ->> 'financial_context_valid' from fresh_snapshot),
  'true',
  'the later order and financial context remains internally valid'
);

select extensions.dblink_disconnect('my_orders_reader');

select is(
  extensions.dblink_exec(
    'my_orders_writer',
    $cleanup$
      delete from public.orders
      where profile_id = 'bb000001-0000-4000-8000-000000000001';
      delete from auth.users
      where id = 'bb000001-0000-4000-8000-000000000001';
      delete from public.lunch_days
      where id = 'bb000010-0000-4000-8000-000000000010';
      delete from public.lunch_providers
      where id = 'bb000020-0000-4000-8000-000000000020';
    $cleanup$
  ),
  'DELETE 1',
  'the independent-session fixtures are removed from the disposable database'
);

select extensions.dblink_disconnect('my_orders_writer');

select * from finish();
rollback;
