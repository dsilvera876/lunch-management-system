-- Recover stranded email queue rows left in processing after worker interruption.

create or replace function private.email_delivery_queue_claim_lease()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '5 minutes';
$$;

revoke all on function private.email_delivery_queue_claim_lease() from public;

create or replace function private.recover_stale_email_delivery_queue_claims(
  p_stale_after interval default private.email_delivery_queue_claim_lease()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.email_delivery_queue q
  set
    status = 'pending',
    claimed_at = null,
    available_at = greatest(q.available_at, now())
  where q.status = 'processing'
    and q.claimed_at is not null
    and q.claimed_at <= now() - p_stale_after;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.recover_stale_email_delivery_queue_claims(interval) from public;

create or replace function public.worker_claim_email_delivery_queue(p_limit integer default 10)
returns setof private.email_delivery_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  perform private.recover_stale_email_delivery_queue_claims();

  return query
  with candidates as (
    select q.id
    from private.email_delivery_queue q
    where q.status = 'pending'
      and q.available_at <= now()
    order by q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update private.email_delivery_queue q
  set
    status = 'processing',
    claimed_at = now(),
    attempts = q.attempts + 1
  from candidates c
  where q.id = c.id
  returning q.*;
end;
$$;

create or replace function public.worker_email_delivery_queue_claim_diagnostics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pending_ready integer;
  v_pending_future integer;
  v_processing integer;
  v_processing_stale integer;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select count(*)::integer
  into v_pending_ready
  from private.email_delivery_queue q
  where q.status = 'pending'
    and q.available_at <= now();

  select count(*)::integer
  into v_pending_future
  from private.email_delivery_queue q
  where q.status = 'pending'
    and q.available_at > now();

  select count(*)::integer
  into v_processing
  from private.email_delivery_queue q
  where q.status = 'processing';

  select count(*)::integer
  into v_processing_stale
  from private.email_delivery_queue q
  where q.status = 'processing'
    and q.claimed_at is not null
    and q.claimed_at <= now() - private.email_delivery_queue_claim_lease();

  return jsonb_build_object(
    'pending_ready', v_pending_ready,
    'pending_future', v_pending_future,
    'processing', v_processing,
    'processing_stale', v_processing_stale
  );
end;
$$;

revoke execute on function public.worker_email_delivery_queue_claim_diagnostics()
  from public, anon, authenticated;
grant execute on function public.worker_email_delivery_queue_claim_diagnostics() to service_role;
