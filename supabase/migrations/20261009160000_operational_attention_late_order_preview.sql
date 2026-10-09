-- In-app late-order notification previews: staff name only (no order details in the bell).

create or replace function private.late_order_submitted_operational_attention_body(
  p_requester_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      nullif(btrim(p.full_name), ''),
      'Staff member'
    )
    || ' submitted a late order.'
  from public.profiles p
  where p.id = p_requester_profile_id;
$$;

revoke all on function private.late_order_submitted_operational_attention_body(uuid) from public;

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

  v_body := private.late_order_submitted_operational_attention_body(
    v_request.requester_profile_id
  );

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

-- Refresh previews for active late-order rows (read state and recipients unchanged).
update private.operational_attention_items o
set body = private.late_order_submitted_operational_attention_body(r.requester_profile_id)
from private.staff_late_order_requests r
where o.event_key = 'hr.late_order_submitted'
  and o.resolved_at is null
  and o.staff_late_order_request_id = r.id
  and private.operational_attention_item_is_active(
    o.resolved_at,
    o.created_at,
    o.event_key,
    o.signup_request_id,
    o.staff_late_order_request_id,
    o.failed_email_queue_id,
    o.failed_provider_dispatch_id,
    o.failed_provider_primary_dispatch_id
  )
  and o.body is distinct from private.late_order_submitted_operational_attention_body(
    r.requester_profile_id
  );
