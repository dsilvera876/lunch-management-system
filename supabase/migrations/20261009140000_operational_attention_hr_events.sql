-- Operational Notification Bell Phase 2: HR signup + late-order attention sync and resolution.
--
-- Work-item lifecycle: signup_requests and staff_late_order_requests only become
-- status 'pending' on INSERT. Server RPCs move pending → approved/rejected/cancelled
-- or fulfilled/declined/expired/cancelled; nothing sets status back to 'pending'.
-- Operational attention therefore uses AFTER INSERT for creation and AFTER UPDATE
-- OF status (leaving pending) for resolution; no re-pending handler is required.

create or replace function private.sync_hr_pending_signup_operational_attention(
  p_signup_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.signup_requests%rowtype;
  v_hr record;
  v_created integer := 0;
  v_name text;
  v_body text;
  v_idempotency_key text;
begin
  if p_signup_request_id is null then
    return 0;
  end if;

  select *
  into v_request
  from private.signup_requests sr
  where sr.id = p_signup_request_id;

  if not found or v_request.status <> 'pending' then
    return 0;
  end if;

  v_name := coalesce(nullif(btrim(v_request.full_name), ''), 'A user');
  v_body := v_name || ' is waiting for approval.';

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_hr.profile_id,
      'hr.pending_signup_approval'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'hr.pending_signup_approval:'
      || p_signup_request_id::text
      || ':'
      || v_hr.profile_id::text;

    perform private.create_operational_attention_item(
      v_hr.profile_id,
      'hr.pending_signup_approval',
      'Pending user approval',
      v_body,
      '/admin/users?view=approvals',
      v_idempotency_key,
      p_signup_request_id => p_signup_request_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_hr_pending_signup_operational_attention(uuid) from public;

create or replace function private.safe_sync_hr_pending_signup_operational_attention(
  p_signup_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_hr_pending_signup_operational_attention(p_signup_request_id);
exception
  when others then
    raise warning 'safe_sync_hr_pending_signup_operational_attention failed for %: %',
      p_signup_request_id, sqlerrm;
end;
$$;

revoke all on function private.safe_sync_hr_pending_signup_operational_attention(uuid) from public;

create or replace function private.sync_hr_late_order_submitted_operational_attention(
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.staff_late_order_requests%rowtype;
  v_hr record;
  v_created integer := 0;
  v_employee_name text;
  v_provider_name text;
  v_body text;
  v_idempotency_key text;
begin
  if p_request_id is null then
    return 0;
  end if;

  select *
  into v_request
  from private.staff_late_order_requests r
  where r.id = p_request_id;

  if not found or v_request.status <> 'pending' then
    return 0;
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'Staff member')
  into v_employee_name
  from public.profiles p
  where p.id = v_request.requester_profile_id;

  select coalesce(nullif(btrim(lp.name), ''), 'Provider')
  into v_provider_name
  from public.lunch_providers lp
  where lp.id = v_request.provider_id;

  v_body :=
    v_employee_name
    || ' submitted a late order for '
    || v_provider_name
    || ' ('
    || to_char(v_request.scheduled_delivery_date, 'YYYY-MM-DD')
    || '). '
    || left(btrim(v_request.requested_summary), 200);

  for v_hr in
    select p.id as profile_id
    from public.profiles p
    where p.role = 'hr'
      and p.account_status = 'active'
  loop
    if not private.operational_attention_recipient_eligible(
      v_hr.profile_id,
      'hr.late_order_submitted'
    ) then
      continue;
    end if;

    v_idempotency_key :=
      'hr.late_order_submitted:'
      || p_request_id::text
      || ':'
      || v_hr.profile_id::text;

    perform private.create_operational_attention_item(
      v_hr.profile_id,
      'hr.late_order_submitted',
      'Late order submitted',
      v_body,
      '/admin/late-orders',
      v_idempotency_key,
      p_staff_late_order_request_id => p_request_id
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.sync_hr_late_order_submitted_operational_attention(uuid) from public;

create or replace function private.safe_sync_hr_late_order_submitted_operational_attention(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_hr_late_order_submitted_operational_attention(p_request_id);
exception
  when others then
    raise warning 'safe_sync_hr_late_order_submitted_operational_attention failed for %: %',
      p_request_id, sqlerrm;
end;
$$;

revoke all on function private.safe_sync_hr_late_order_submitted_operational_attention(uuid) from public;

create or replace function private.trg_operational_attention_after_signup_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform private.safe_sync_hr_pending_signup_operational_attention(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_operational_attention_after_signup_insert() from public;

drop trigger if exists operational_attention_after_signup_insert on private.signup_requests;

create trigger operational_attention_after_signup_insert
  after insert on private.signup_requests
  for each row
  execute function private.trg_operational_attention_after_signup_insert();

create or replace function private.trg_operational_attention_after_late_order_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform private.safe_sync_hr_late_order_submitted_operational_attention(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_operational_attention_after_late_order_insert() from public;

drop trigger if exists operational_attention_after_late_order_insert on private.staff_late_order_requests;

create trigger operational_attention_after_late_order_insert
  after insert on private.staff_late_order_requests
  for each row
  execute function private.trg_operational_attention_after_late_order_insert();

create or replace function private.trg_operational_attention_resolve_signup_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status is distinct from old.status then
    perform private.resolve_operational_attention_for_signup_request(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_operational_attention_resolve_signup_status() from public;

drop trigger if exists operational_attention_resolve_signup_status on private.signup_requests;

create trigger operational_attention_resolve_signup_status
  after update of status on private.signup_requests
  for each row
  execute function private.trg_operational_attention_resolve_signup_status();

create or replace function private.trg_operational_attention_resolve_late_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status is distinct from old.status then
    perform private.resolve_operational_attention_for_late_order_request(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_operational_attention_resolve_late_order_status() from public;

drop trigger if exists operational_attention_resolve_late_order_status on private.staff_late_order_requests;

create trigger operational_attention_resolve_late_order_status
  after update of status on private.staff_late_order_requests
  for each row
  execute function private.trg_operational_attention_resolve_late_order_status();

create or replace function private.backfill_hr_operational_attention_pending_work()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup_id uuid;
  v_late_id uuid;
  v_signup_rows integer := 0;
  v_late_rows integer := 0;
  v_signup_notifications integer := 0;
  v_late_notifications integer := 0;
begin
  for v_signup_id in
    select sr.id
    from private.signup_requests sr
    where sr.status = 'pending'
  loop
    v_signup_rows := v_signup_rows + 1;
    v_signup_notifications := v_signup_notifications
      + private.sync_hr_pending_signup_operational_attention(v_signup_id);
  end loop;

  for v_late_id in
    select r.id
    from private.staff_late_order_requests r
    where r.status = 'pending'
  loop
    v_late_rows := v_late_rows + 1;
    v_late_notifications := v_late_notifications
      + private.sync_hr_late_order_submitted_operational_attention(v_late_id);
  end loop;

  return jsonb_build_object(
    'pending_signup_requests', v_signup_rows,
    'pending_late_order_requests', v_late_rows,
    'signup_attention_rows_synced', v_signup_notifications,
    'late_order_attention_rows_synced', v_late_notifications
  );
end;
$$;

revoke all on function private.backfill_hr_operational_attention_pending_work() from public;

select private.backfill_hr_operational_attention_pending_work();
