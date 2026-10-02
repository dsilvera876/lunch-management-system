-- Remove obsolete hr.delivery_issue_reported (no notification workflow; reconciliation unchanged).

delete from private.notification_settings
where event_key = 'hr.delivery_issue_reported';

delete from private.notification_email_templates
where event_key = 'hr.delivery_issue_reported';

delete from private.staff_notification_preferences
where event_key = 'hr.delivery_issue_reported';

delete from private.notification_event_catalog
where event_key = 'hr.delivery_issue_reported';
