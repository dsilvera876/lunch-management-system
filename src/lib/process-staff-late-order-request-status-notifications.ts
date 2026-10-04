import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildStaffLateOrderRequestStatusRenderedEmail,
  loadStaffLateOrderRequestStatusContext,
  type PendingStaffLateOrderRequestStatusRow,
} from "@/lib/staff-late-order-request-content";

export type ProcessStaffLateOrderRequestStatusNotificationsResult = {
  queued: number;
  skipped: number;
  failures: number;
  renderFailures: number;
};

async function recordNotificationRenderFailure(
  supabase: SupabaseClient,
  deliveryId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await supabase.rpc("worker_record_notification_render_failure", {
    p_delivery_id: deliveryId,
    p_error: message,
  });
}

export async function processStaffLateOrderRequestStatusNotifications(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<ProcessStaffLateOrderRequestStatusNotificationsResult> {
  const result: ProcessStaffLateOrderRequestStatusNotificationsResult = {
    queued: 0,
    skipped: 0,
    failures: 0,
    renderFailures: 0,
  };

  const { data: pendingRows, error: pendingError } = await supabase.rpc(
    "worker_list_pending_staff_late_order_request_status_deliveries",
    { p_limit: options.limit ?? 100 },
  );

  if (pendingError) {
    throw new Error(
      `Staff late order request status pending list failed: ${pendingError.message}`,
    );
  }

  const rows = (pendingRows ?? []) as PendingStaffLateOrderRequestStatusRow[];
  if (rows.length === 0) {
    return result;
  }

  const templateCache = new Map<
    string,
    { subject_template: string; body_html_template: string; body_text_template: string | null }
  >();

  for (const row of rows) {
    let template = templateCache.get(row.event_key);
    if (!template) {
      const { data: templateRow, error: templateError } = await supabase.rpc(
        "worker_get_notification_email_template",
        { p_event_key: row.event_key },
      );

      if (templateError || !templateRow?.[0]) {
        result.failures += 1;
        continue;
      }

      const loaded = templateRow[0] as Record<string, string | null>;
      template = {
        subject_template: String(loaded.subject_template),
        body_html_template: String(loaded.body_html_template),
        body_text_template: loaded.body_text_template,
      };
      templateCache.set(row.event_key, template);
    }

    let context;
    try {
      context = await loadStaffLateOrderRequestStatusContext(
        supabase,
        row.staff_late_order_request_id,
      );
    } catch (error) {
      if (!options.dryRun) {
        await recordNotificationRenderFailure(supabase, row.delivery_id, error);
      }
      result.renderFailures += 1;
      result.failures += 1;
      continue;
    }

    if (!context) {
      result.skipped += 1;
      continue;
    }

    let rendered;
    try {
      rendered = buildStaffLateOrderRequestStatusRenderedEmail(context, {
        subjectTemplate: template.subject_template,
        bodyHtmlTemplate: template.body_html_template,
        bodyTextTemplate: template.body_text_template ?? "",
      });
    } catch (error) {
      if (!options.dryRun) {
        await recordNotificationRenderFailure(supabase, row.delivery_id, error);
      }
      result.renderFailures += 1;
      result.failures += 1;
      continue;
    }

    if (options.dryRun) {
      result.skipped += 1;
      continue;
    }

    const { error: queueError } = await supabase.rpc("worker_queue_notification_delivery", {
      p_delivery_id: row.delivery_id,
      p_recipient_email: row.recipient_email,
      p_subject: rendered.subject,
      p_text_body: rendered.textBody,
      p_html_body: rendered.htmlBody,
    });

    if (queueError) {
      result.failures += 1;
      continue;
    }

    result.queued += 1;
  }

  return result;
}
