-- Staff order notifications: one email per logical order event.
--
-- notify_staff_order_event previously keyed delivery intents on a freshly
-- inserted lifecycle row id, so every repeated call produced a new pending
-- email.
--
-- Identity model: every distinct notifiable state an order reaches is an order
-- state revision (per-order counter, unique per order). A revision belongs to
-- the event reported by the mutation that produced it. The staff email for an
-- order event is keyed on the order and revision, so:
--   * retrying an event at the same state reuses the revision and is a no-op;
--   * a genuine modification creates a new revision, even if it returns the
--     order to an earlier state;
--   * an older event retried after a different event is ignored, because the
--     current revision belongs to the other event.
-- Revisions are recorded before preference checks, so an email suppressed by
-- preferences does not hide a later change. Uniqueness is enforced by the
-- revision primary key, the lifecycle (order, revision) index and the delivery
-- log idempotency key; calls for one order also serialize on the order row lock.

alter table private.order_notification_lifecycle
  add column if not exists state_fingerprint text,
  add column if not exists state_revision integer;

create unique index if not exists order_notification_lifecycle_order_revision_idx
  on private.order_notification_lifecycle (order_id, state_revision)
  where state_revision is not null;

create table if not exists private.order_notification_state_revisions (
  order_id uuid not null references public.orders (id) on delete cascade,
  revision integer not null check (revision > 0),
  state_fingerprint text not null,
  event_key text,
  created_at timestamptz not null default now(),
  primary key (order_id, revision)
);

revoke all on private.order_notification_state_revisions from public, anon, authenticated;

create or replace function private.staff_order_notification_state_fingerprint(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(
    jsonb_build_object(
      'status', o.status,
      'meal_quantity', o.meal_quantity,
      'special_instructions', o.special_instructions,
      'office_location_id', o.office_location_id,
      'items', private.order_items_audit_snapshot(o.id)
    )::text
  )
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function private.staff_order_notification_state_fingerprint(uuid) from public;

-- Returns the order's current state revision, creating the next one (owned by
-- p_event_key, which may be null for mutations that send no staff email) when
-- the notifiable state differs from the latest revision.
create or replace function private.record_order_notification_state_revision(
  p_order_id uuid,
  p_event_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
  v_latest private.order_notification_state_revisions%rowtype;
  v_revision integer;
begin
  perform 1 from public.orders o where o.id = p_order_id for update;

  if not found then
    return null;
  end if;

  v_fingerprint := private.staff_order_notification_state_fingerprint(p_order_id);

  select *
  into v_latest
  from private.order_notification_state_revisions r
  where r.order_id = p_order_id
  order by r.revision desc
  limit 1;

  if found and v_latest.state_fingerprint = v_fingerprint then
    return v_latest.revision;
  end if;

  v_revision := coalesce(v_latest.revision, 0) + 1;

  insert into private.order_notification_state_revisions (
    order_id, revision, state_fingerprint, event_key
  )
  values (p_order_id, v_revision, v_fingerprint, p_event_key);

  return v_revision;
end;
$$;

revoke all on function private.record_order_notification_state_revision(uuid, text) from public;

-- Orders that were already notified keep their latest notification as revision 1,
-- so a retry of that event right after deployment stays a no-op.
with latest as (
  select distinct on (l.order_id) l.id, l.order_id, l.event_key
  from private.order_notification_lifecycle l
  where l.state_revision is null
  order by l.order_id, l.created_at desc
),
revisions as (
  insert into private.order_notification_state_revisions (
    order_id, revision, state_fingerprint, event_key
  )
  select
    latest.order_id,
    1,
    private.staff_order_notification_state_fingerprint(latest.order_id),
    latest.event_key
  from latest
  where not exists (
    select 1
    from private.order_notification_state_revisions r
    where r.order_id = latest.order_id
  )
  returning order_id, state_fingerprint
)
update private.order_notification_lifecycle l
set state_revision = 1,
    state_fingerprint = revisions.state_fingerprint
from latest
inner join revisions on revisions.order_id = latest.order_id
where l.id = latest.id;

create or replace function private.notify_staff_order_event(
  p_event_key text,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_order_date date;
  v_batch_id uuid;
  v_revision integer;
  v_revision_row private.order_notification_state_revisions%rowtype;
  v_lifecycle_id uuid;
  v_delivery_id uuid;
begin
  if p_event_key is null or p_order_id is null then
    return;
  end if;

  select o.profile_id, ld.order_date
  into v_profile_id, v_order_date
  from public.orders o
  inner join public.lunch_days ld on ld.id = o.lunch_day_id
  where o.id = p_order_id
  for update of o;

  if not found then
    return;
  end if;

  v_revision := private.record_order_notification_state_revision(p_order_id, p_event_key);

  select *
  into v_revision_row
  from private.order_notification_state_revisions r
  where r.order_id = p_order_id
    and r.revision = v_revision;

  if v_revision_row.event_key is distinct from p_event_key then
    return;
  end if;

  if not private.staff_order_notification_eligible(v_profile_id, p_event_key) then
    return;
  end if;

  insert into private.order_notification_lifecycle (
    order_id, event_key, state_fingerprint, state_revision
  )
  values (p_order_id, p_event_key, v_revision_row.state_fingerprint, v_revision)
  on conflict (order_id, state_revision) where state_revision is not null do nothing
  returning id into v_lifecycle_id;

  if v_lifecycle_id is null then
    return;
  end if;

  insert into private.notification_delivery_batch (event_key, operational_date)
  values (p_event_key, v_order_date)
  returning id into v_batch_id;

  insert into private.notification_delivery_log (
    event_key,
    profile_id,
    operational_date,
    batch_id,
    status,
    idempotency_key,
    order_id
  )
  values (
    p_event_key,
    v_profile_id,
    v_order_date,
    v_batch_id,
    'pending',
    'staff.order_event:' || p_order_id::text || ':revision:' || v_revision::text,
    p_order_id
  )
  on conflict (idempotency_key) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then
    delete from private.notification_delivery_batch b where b.id = v_batch_id;
  end if;
exception
  when others then
    raise warning 'notify_staff_order_event failed for order % event %: %',
      p_order_id, p_event_key, sqlerrm;
end;
$$;

revoke all on function private.notify_staff_order_event(text, uuid) from public;
