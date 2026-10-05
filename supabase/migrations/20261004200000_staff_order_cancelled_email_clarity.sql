-- Clarify staff.order_cancelled email: identify provider (and order summary), not all orders for the day.
-- Only replace rows that still match the prior shipped default (admin-customized templates are untouched).

update private.notification_email_templates t
set
  subject_template = 'Lunch order with {{provider_name}} cancelled for {{order_date}}',
  body_html_template = $html$
<p>Hi {{first_name}},</p>
<p>Your lunch order with <strong>{{provider_name}}</strong> for <strong>{{order_date}}</strong> has been cancelled.</p>
<p><strong>Order:</strong><br>{{order_summary}}</p>
<p>Other lunch orders for this day were not affected.</p>
<p>{{reorder_message}}</p>
$html$,
  body_text_template = $text$
Hi {{first_name}},

Your lunch order with {{provider_name}} for {{order_date}} has been cancelled.

Order:
{{order_summary}}

Other lunch orders for this day were not affected.

{{reorder_message}}
$text$
where t.event_key = 'staff.order_cancelled'
  and t.subject_template = 'Lunch order cancelled for {{order_date}}'
  and t.body_html_template = '<p>Hi {{first_name}},</p><p>Your lunch order for <strong>{{order_date}}</strong> has been cancelled.</p><p>{{reorder_message}}</p>'
  and coalesce(t.body_text_template, '') = $old_text$Hi {{first_name}},

Your lunch order for {{order_date}} has been cancelled.

{{reorder_message}}$old_text$;
