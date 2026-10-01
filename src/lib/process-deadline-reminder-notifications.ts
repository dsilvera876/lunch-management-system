import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildDeadlineReminderRenderedEmail,
  firstNameFromFullName,
} from "@/lib/deadline-reminder-notification-content";
import { getApplicationOrigin } from "@/lib/request-origin";

export type DeadlineReminderPrepareDiagnostics = {
  action: string;
  reason?: string;
  orderDate?: string;
  sendTime?: string;
  windowOpen?: boolean;
  candidates?: number;
  eligibleCount?: number;
  inserted?: number;
  batchId?: string | null;
  skipReasonCounts?: Record<string, number>;
};

export type ProcessDeadlineReminderNotificationsResult = {
  prepared: boolean;
  batchId: string | null;
  inserted: number;
  queued: number;
  skipped: number;
  failures: number;
  renderFailures: number;
  diagnostics: DeadlineReminderPrepareDiagnostics | null;
};

type PendingDeliveryRow = {
  delivery_id: string;
  profile_id: string;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

function parsePrepareDiagnostics(raw: unknown): DeadlineReminderPrepareDiagnostics | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const skipReasonCounts =
    data.skip_reason_counts && typeof data.skip_reason_counts === "object"
      ? (data.skip_reason_counts as Record<string, number>)
      : undefined;

  return {
    action: String(data.action ?? "unknown"),
    reason: data.reason ? String(data.reason) : undefined,
    orderDate: data.order_date ? String(data.order_date) : undefined,
    sendTime: data.send_time ? String(data.send_time) : undefined,
    windowOpen:
      typeof data.window_open === "boolean"
        ? data.window_open
        : data.window_open === "true"
          ? true
          : data.window_open === "false"
            ? false
            : undefined,
    candidates: data.candidates !== undefined ? Number(data.candidates) : undefined,
    eligibleCount: data.eligible_count !== undefined ? Number(data.eligible_count) : undefined,
    inserted: data.inserted !== undefined ? Number(data.inserted) : undefined,
    batchId: data.batch_id ? String(data.batch_id) : null,
    skipReasonCounts,
  };
}

export function formatDeadlineReminderWorkerLogLine(
  diagnostics: DeadlineReminderPrepareDiagnostics | null,
  result: Pick<
    ProcessDeadlineReminderNotificationsResult,
    "queued" | "skipped" | "failures" | "inserted" | "renderFailures"
  >,
): string {
  if (!diagnostics) {
    return "Deadline reminder notifications: no prepare diagnostics";
  }

  const parts = [
    `action=${diagnostics.action}`,
    diagnostics.orderDate ? `order_date=${diagnostics.orderDate}` : null,
    diagnostics.sendTime ? `send_time=${diagnostics.sendTime}` : null,
    diagnostics.windowOpen !== undefined ? `window_open=${diagnostics.windowOpen}` : null,
    diagnostics.reason ? `reason=${diagnostics.reason}` : null,
    diagnostics.candidates !== undefined ? `candidates=${diagnostics.candidates}` : null,
    diagnostics.eligibleCount !== undefined ? `eligible=${diagnostics.eligibleCount}` : null,
    `generated=${result.inserted}`,
    `queued=${result.queued}`,
    `render_skipped=${result.skipped}`,
    `render_failures=${result.renderFailures}`,
    `queue_failures=${result.failures}`,
  ].filter(Boolean);

  if (diagnostics.skipReasonCounts && Object.keys(diagnostics.skipReasonCounts).length > 0) {
    parts.push(`skip_reasons=${JSON.stringify(diagnostics.skipReasonCounts)}`);
  }

  return `Deadline reminder notifications: ${parts.join(" ")}`;
}

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
      `Deadline reminder render failure could not be recorded: delivery=${deliveryId} error=${recordError.message}`,
    );
  }
}

export async function processDeadlineReminderNotifications(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; asOf?: string } = {},
): Promise<ProcessDeadlineReminderNotificationsResult> {
  const result: ProcessDeadlineReminderNotificationsResult = {
    prepared: false,
    batchId: null,
    inserted: 0,
    queued: 0,
    skipped: 0,
    failures: 0,
    renderFailures: 0,
    diagnostics: null,
  };

  const { data: prepareData, error: prepareError } = await supabase.rpc(
    "worker_prepare_deadline_reminder_batch",
    { p_as_of: options.asOf ?? new Date().toISOString() },
  );

  if (prepareError) {
    throw new Error(`Deadline reminder batch prepare failed: ${prepareError.message}`);
  }

  const diagnostics = parsePrepareDiagnostics(prepareData);
  result.diagnostics = diagnostics;

  if (diagnostics?.action !== "prepared") {
    await recordProcessingRunQueueStats(supabase, diagnostics, result);
    return result;
  }

  result.prepared = true;
  result.batchId = diagnostics.batchId ?? null;
  result.inserted = diagnostics.inserted ?? 0;

  if (options.dryRun) {
    await recordProcessingRunQueueStats(supabase, diagnostics, result);
    return result;
  }

  const { data: templateRow, error: templateError } = await supabase.rpc(
    "worker_get_notification_email_template",
    { p_event_key: "staff.deadline_reminder" },
  );

  if (templateError) {
    throw new Error(`Deadline reminder template load failed: ${templateError.message}`);
  }

  const template = (templateRow as Array<Record<string, string>> | null)?.[0];
  if (!template) {
    throw new Error("Deadline reminder template is not configured");
  }

  const appOrigin = getApplicationOrigin();

  const { data: pendingRows, error: pendingError } = await supabase.rpc(
    "worker_list_pending_deadline_reminder_deliveries",
    { p_limit: 200 },
  );

  if (pendingError) {
    throw new Error(`Deadline reminder pending list failed: ${pendingError.message}`);
  }

  for (const row of (pendingRows ?? []) as PendingDeliveryRow[]) {
    let rendered;
    try {
      rendered = await buildDeadlineReminderRenderedEmail(supabase, {
        orderDate: row.operational_date,
        firstName: firstNameFromFullName(row.recipient_name, row.recipient_email),
        appOrigin,
        subjectTemplate: template.subject_template,
        bodyHtmlTemplate: template.body_html_template,
        bodyTextTemplate: template.body_text_template ?? "",
      });
    } catch (error) {
      console.error(
        `Deadline reminder render failed: delivery=${row.delivery_id} profile=${row.profile_id} error=${error instanceof Error ? error.message : error}`,
      );
      await recordNotificationRenderFailure(supabase, row.delivery_id, error);
      result.renderFailures += 1;
      result.failures += 1;
      continue;
    }

    if (!rendered) {
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

  await recordProcessingRunQueueStats(supabase, diagnostics, result);

  return result;
}

async function recordProcessingRunQueueStats(
  supabase: SupabaseClient,
  diagnostics: DeadlineReminderPrepareDiagnostics | null,
  result: Pick<ProcessDeadlineReminderNotificationsResult, "queued" | "inserted">,
): Promise<void> {
  if (!diagnostics?.orderDate || !diagnostics.sendTime) {
    return;
  }

  if (diagnostics.action !== "prepared" && diagnostics.action !== "skipped") {
    return;
  }

  const sendTime =
    diagnostics.sendTime.length === 5 ? `${diagnostics.sendTime}:00` : diagnostics.sendTime;

  const { error } = await supabase.rpc("worker_update_notification_processing_run", {
    p_event_key: "staff.deadline_reminder",
    p_operational_date: diagnostics.orderDate,
    p_scheduled_send_time: sendTime,
    p_queued_count: result.queued,
    p_processing_status:
      result.queued > 0
        ? result.queued < result.inserted
          ? "partially_generated"
          : "generated"
        : null,
  });

  if (error) {
    throw new Error(`Deadline reminder processing run update failed: ${error.message}`);
  }
}
