-- Fix worker staff-order context query (missing lunch_providers join for lp.name).

create or replace function public.worker_get_staff_order_notification_context(p_order_id uuid)
returns table (
  provider_name text,
  order_summary text,
  order_total numeric,
  order_status text,
  ordering_still_open boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_day_status text;
  v_deadline timestamptz;
  v_provider_name text;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id;

  if not found then
    return;
  end if;

  select
    ld.status,
    public.effective_order_deadline(ld.id),
    coalesce(lp.name, 'Lunch provider')
  into v_day_status, v_deadline, v_provider_name
  from public.lunch_days ld
  left join public.lunch_providers lp on lp.id = ld.provider_id
  where ld.id = v_order.lunch_day_id;

  return query
  select
    v_provider_name,
    private.format_order_email_summary(p_order_id),
    public.calculate_order_total(p_order_id),
    v_order.status,
    (
      v_order.status = 'submitted'
      and v_day_status = 'open'
      and now() <= v_deadline
    );
end;
$$;

revoke execute on function public.worker_get_staff_order_notification_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_staff_order_notification_context(uuid) to service_role;

create or replace function public.worker_record_notification_render_failure(
  p_delivery_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  update private.notification_delivery_log d
  set
    last_error = left(
      'Render failed: ' || coalesce(nullif(btrim(p_error), ''), 'Unknown error'),
      500
    ),
    updated_at = now()
  where d.id = p_delivery_id
    and d.status = 'pending'
    and d.email_queue_id is null;
end;
$$;

revoke execute on function public.worker_record_notification_render_failure(uuid, text)
  from public, anon, authenticated;
grant execute on function public.worker_record_notification_render_failure(uuid, text) to service_role;
