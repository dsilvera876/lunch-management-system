import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildStaffLunchPeriodFinalizedRenderedEmail,
  loadStaffLunchPeriodFinalizedNotificationContext,
  type PendingStaffLunchPeriodFinalizedRow,
} from "@/lib/staff-lunch-period-finalized-notification-content";
import { getApplicationOrigin } from "@/lib/request-origin";

export type ProcessStaffLunchPeriodFinalizedNotificationsResult = {
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

  const { error: recordError } = await supabase.rpc(
    "worker_record_notification_render_failure",
    {
      p_delivery_id: deliveryId,
      p_error: message,
    },
  );

  if (recordError) {
    console.error(
      `Staff lunch period finalized render could not be recorded: delivery=${deliveryId} error=${recordError.message}`,
    );
  }
}

export async function processStaffLunchPeriodFinalizedNotifications(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<ProcessStaffLunchPeriodFinalizedNotificationsResult> {
  const result: ProcessStaffLunchPeriodFinalizedNotificationsResult = {
    queued: 0,
    skipped: 0,
    failures: 0,
    renderFailures: 0,
  };

  const { data: pendingRows, error: pendingError } = await supabase.rpc(
    "worker_list_pending_staff_lunch_period_finalized_deliveries",
    { p_limit: options.limit ?? 100 },
  );

  if (pendingError) {
    throw new Error(
      `Staff lunch period finalized pending list failed: ${pendingError.message}`,
    );
  }

  const rows = (pendingRows ?? []) as PendingStaffLunchPeriodFinalizedRow[];
  if (rows.length === 0) {
    return result;
  }

  const appOrigin = getApplicationOrigin();
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

      if (templateError) {
        result.failures += 1;
        continue;
      }

      const loaded = (templateRow as Array<Record<string, string | null>> | null)?.[0];
      if (!loaded) {
        result.skipped += 1;
        continue;
      }

      template = {
        subject_template: String(loaded.subject_template),
        body_html_template: String(loaded.body_html_template),
        body_text_template: loaded.body_text_template,
      };
      templateCache.set(row.event_key, template);
    }

    let context;
    try {
      context = await loadStaffLunchPeriodFinalizedNotificationContext(
        supabase,
        row.delivery_id,
        row.recipient_name,
        row.recipient_email,
      );
    } catch (error) {
      console.error(
        `Staff lunch period finalized context failed: delivery=${row.delivery_id} error=${error instanceof Error ? error.message : error}`,
      );
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
      rendered = buildStaffLunchPeriodFinalizedRenderedEmail(context, appOrigin, {
        subjectTemplate: template.subject_template,
        bodyHtmlTemplate: template.body_html_template,
        bodyTextTemplate: template.body_text_template ?? "",
      });
    } catch (error) {
      console.error(
        `Staff lunch period finalized render failed: delivery=${row.delivery_id} error=${error instanceof Error ? error.message : error}`,
      );
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
