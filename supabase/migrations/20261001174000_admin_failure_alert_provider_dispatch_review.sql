-- Admin failure alerts: distinguish queue monitoring vs provider supplemental dispatch failures.

update private.notification_event_catalog c
set allowed_variables = array[
  'message_type', 'recipient', 'failed_at', 'error_summary', 'review_html', 'review_text'
]
where c.event_key = 'admin.email_delivery_failure';

update private.notification_email_templates t
set
  body_html_template = '<p>An application email could not be delivered after repeated attempts.</p><p><strong>Type:</strong><br>{{message_type}}</p><p><strong>Recipient:</strong><br>{{recipient}}</p><p><strong>Failed:</strong><br>{{failed_at}}</p><p><strong>Error:</strong><br>{{error_summary}}</p>{{review_html}}',
  body_text_template = 'An application email could not be delivered after repeated attempts.

Type:
{{message_type}}

Recipient:
{{recipient}}

Failed:
{{failed_at}}

Error:
{{error_summary}}

{{review_text}}'
where t.event_key = 'admin.email_delivery_failure';

drop function if exists public.worker_get_admin_email_delivery_failure_context(uuid);

create or replace function public.worker_get_admin_email_delivery_failure_context(
  p_delivery_id uuid
)
returns table (
  failure_source text,
  message_type text,
  recipient text,
  failed_at timestamptz,
  error_summary text,
  provider_name text,
  scheduled_delivery_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery private.notification_delivery_log%rowtype;
begin
  if not (select private.is_worker_service_caller()) then
    raise exception 'Service role required';
  end if;

  select *
  into v_delivery
  from private.notification_delivery_log d
  where d.id = p_delivery_id
    and d.event_key = 'admin.email_delivery_failure';

  if not found then
    return;
  end if;

  if v_delivery.failed_email_queue_id is not null then
    return query
    select
      'email_delivery_queue'::text,
      q.message_type,
      q.recipient_email,
      coalesce(q.claimed_at, q.created_at),
      left(coalesce(nullif(btrim(q.last_error), ''), 'Delivery failed'), 500),
      null::text,
      null::date
    from private.email_delivery_queue q
    where q.id = v_delivery.failed_email_queue_id;
    return;
  end if;

  if v_delivery.failed_provider_dispatch_id is not null then
    return query
    select
      'provider_supplemental_dispatch'::text,
      'Provider supplemental late-order dispatch'::text,
      coalesce(d.provider_email, 'unknown'),
      coalesce(d.sent_at, d.created_at),
      left(coalesce(nullif(btrim(d.error_summary), ''), 'Delivery failed'), 500),
      lp.name,
      d.scheduled_delivery_date
    from public.provider_late_order_dispatches d
    inner join public.lunch_providers lp on lp.id = d.provider_id
    where d.id = v_delivery.failed_provider_dispatch_id;
  end if;
end;
$$;

revoke execute on function public.worker_get_admin_email_delivery_failure_context(uuid)
  from public, anon, authenticated;
grant execute on function public.worker_get_admin_email_delivery_failure_context(uuid) to service_role;
