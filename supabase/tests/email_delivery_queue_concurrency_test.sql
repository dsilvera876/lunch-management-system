begin;

select plan(11);

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
  'mail_worker_a',
  'host=supabase_db_lunch-management-system port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'mail_worker_b',
  'host=supabase_db_lunch-management-system port=5432 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_exec(
  'mail_worker_b',
  $setup$
    delete from private.email_delivery_queue
    where recipient_email in (
      'concurrent-worker-a@example.test',
      'concurrent-worker-b@example.test'
    );

    insert into private.email_delivery_queue (
      message_type,
      recipient_email,
      subject,
      text_body,
      html_body,
      status,
      attempts,
      available_at,
      created_at
    )
    values
      (
        'test',
        'concurrent-worker-a@example.test',
        'Concurrent worker A',
        'worker A body',
        '<p>worker A body</p>',
        'pending',
        0,
        '1900-01-01 00:00:00+00',
        '1900-01-01 00:00:00+00'
      ),
      (
        'test',
        'concurrent-worker-b@example.test',
        'Concurrent worker B',
        'worker B body',
        '<p>worker B body</p>',
        'pending',
        0,
        '1900-01-01 00:00:01+00',
        '1900-01-01 00:00:01+00'
      );
  $setup$
);

select extensions.dblink_exec(
  'mail_worker_a',
  $$ set request.jwt.claim.role = 'service_role' $$
);
select extensions.dblink_exec(
  'mail_worker_b',
  $$ set request.jwt.claim.role = 'service_role' $$
);

select pg_advisory_lock(73201921001);

select ok(
  extensions.dblink_send_query(
    'mail_worker_a',
    $worker_a$
      do $claim$
      begin
        perform id from public.worker_claim_email_delivery_queue(1);
        perform pg_advisory_xact_lock(73201921002);
        perform pg_advisory_xact_lock(73201921001);
      end
      $claim$;
    $worker_a$
  ) = 1,
  'worker A starts an asynchronous claim transaction'
);

select ok(
  pg_temp.wait_for_advisory_lock(73201921002),
  'worker A holds its queue-row lock before worker B starts'
);

select is(
  (
    select claimed.recipient_email
    from extensions.dblink(
      'mail_worker_b',
      $$ select recipient_email from public.worker_claim_email_delivery_queue(1) $$
    ) as claimed(recipient_email text)
  ),
  'concurrent-worker-b@example.test',
  'worker B skips worker A locked row and claims the next eligible row'
);

select is(
  extensions.dblink_is_busy('mail_worker_a'),
  1,
  'worker A remains blocked while worker B commits its independent claim'
);

select is(
  (
    select status
    from private.email_delivery_queue
    where recipient_email = 'concurrent-worker-b@example.test'
  ),
  'processing',
  'worker B claim is committed while worker A still holds its transaction'
);

select is(
  (
    select attempts
    from private.email_delivery_queue
    where recipient_email = 'concurrent-worker-b@example.test'
  ),
  1,
  'worker B increments its claimed row exactly once'
);

select ok(pg_advisory_unlock(73201921001), 'worker A release barrier is removed');

select ok(
  pg_temp.wait_for_dblink('mail_worker_a'),
  'worker A completes after the release barrier is removed'
);

select results_eq(
  $$
    select recipient_email, status, attempts
    from private.email_delivery_queue
    where recipient_email in (
      'concurrent-worker-a@example.test',
      'concurrent-worker-b@example.test'
    )
    order by recipient_email
  $$,
  $$
    values
      ('concurrent-worker-a@example.test'::text, 'processing'::text, 1::integer),
      ('concurrent-worker-b@example.test'::text, 'processing'::text, 1::integer)
  $$,
  'both workers claim distinct rows and each attempt count is one'
);

select is(
  (
    select sum(attempts)::integer
    from private.email_delivery_queue
    where recipient_email in (
      'concurrent-worker-a@example.test',
      'concurrent-worker-b@example.test'
    )
  ),
  2,
  'the two overlapping claims produce exactly two total attempts'
);

select extensions.dblink_disconnect('mail_worker_a');

select is(
  extensions.dblink_exec(
    'mail_worker_b',
    $cleanup$
      delete from private.email_delivery_queue
      where recipient_email in (
        'concurrent-worker-a@example.test',
        'concurrent-worker-b@example.test'
      )
    $cleanup$
  ),
  'DELETE 2',
  'concurrency fixtures are removed from the disposable local database'
);

select extensions.dblink_disconnect('mail_worker_b');

select * from finish();
rollback;
