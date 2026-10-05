begin;

select plan(4);

\ir support/isolate_existing_owner.inc

insert into auth.users (id, email, raw_user_meta_data)
values (
  'c8111111-1111-4111-8111-111111111111',
  'cancel-template-admin@test.local',
  '{"full_name":"Cancel Template Admin"}'
);

select private.apply_profile_role('c8111111-1111-4111-8111-111111111111', 'admin');

reset role;

select ok(
  (
    select t.subject_template = 'Lunch order with {{provider_name}} cancelled for {{order_date}}'
      and t.body_text_template like '%Other lunch orders for this day were not affected.%'
      and t.body_text_template like '%{{provider_name}}%'
      and t.body_text_template like '%{{order_summary}}%'
    from private.notification_email_templates t
    where t.event_key = 'staff.order_cancelled'
  ),
  'new installs and migrated defaults use provider-specific cancelled template (C)'
);

select lives_ok(
  $$
    select private.assert_notification_template_variables(
      'staff.order_cancelled',
      t.subject_template,
      t.body_html_template,
      t.body_text_template
    )
    from private.notification_email_templates t
    where t.event_key = 'staff.order_cancelled'
  $$,
  'shipped cancelled template variables are allowed by catalog (D)'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
  true
);

select public.upsert_notification_email_template(
  'staff.order_cancelled',
  'Custom cancel notice for {{first_name}}',
  '<p>Custom HTML for {{first_name}} on {{order_date}}</p>',
  'Custom text for {{first_name}}',
  true
);

reset role;

\ir support/staff_order_cancelled_clarity_upgrade.inc

select is(
  (
    select t.subject_template
    from private.notification_email_templates t
    where t.event_key = 'staff.order_cancelled'
  ),
  'Custom cancel notice for {{first_name}}',
  'admin-customized cancelled template is preserved when re-applying clarity upgrade (B)'
);

update private.notification_email_templates t
set
  subject_template = 'Lunch order cancelled for {{order_date}}',
  body_html_template = '<p>Hi {{first_name}},</p><p>Your lunch order for <strong>{{order_date}}</strong> has been cancelled.</p><p>{{reorder_message}}</p>',
  body_text_template = $old$Hi {{first_name}},

Your lunch order for {{order_date}} has been cancelled.

{{reorder_message}}$old$
where t.event_key = 'staff.order_cancelled';

\ir support/staff_order_cancelled_clarity_upgrade.inc

select ok(
  (
    select t.subject_template = 'Lunch order with {{provider_name}} cancelled for {{order_date}}'
      and t.body_text_template like '%Other lunch orders for this day were not affected.%'
    from private.notification_email_templates t
    where t.event_key = 'staff.order_cancelled'
  ),
  'prior shipped default upgrades to provider-specific cancelled template (A)'
);

select * from finish();

rollback;
