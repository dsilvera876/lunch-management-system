import type { SupabaseClient } from "@supabase/supabase-js";

import { getApplicationOrigin } from "@/lib/request-origin";
import {
  buildTodayMenuRenderedEmail,
  firstNameFromFullName,
} from "@/lib/today-menu-notification-content";

export type TodayMenuPrepareDiagnostics = {
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

export type ProcessTodayMenuNotificationsResult = {
  prepared: boolean;
  batchId: string | null;
  inserted: number;
  queued: number;
  skipped: number;
  failures: number;
  diagnostics: TodayMenuPrepareDiagnostics | null;
};

type PendingDeliveryRow = {
  delivery_id: string;
  profile_id: string;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

function parsePrepareDiagnostics(raw: unknown): TodayMenuPrepareDiagnostics | null {
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

export function formatTodayMenuWorkerLogLine(
  diagnostics: TodayMenuPrepareDiagnostics | null,
  result: Pick<
    ProcessTodayMenuNotificationsResult,
    "queued" | "skipped" | "failures" | "inserted"
  >,
): string {
  if (!diagnostics) {
    return "Today menu notifications: no prepare diagnostics";
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
    `queue_failures=${result.failures}`,
  ].filter(Boolean);

  if (diagnostics.skipReasonCounts && Object.keys(diagnostics.skipReasonCounts).length > 0) {
    parts.push(`skip_reasons=${JSON.stringify(diagnostics.skipReasonCounts)}`);
  }

  return `Today menu notifications: ${parts.join(" ")}`;
}

export async function processTodayMenuNotifications(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; asOf?: string } = {},
): Promise<ProcessTodayMenuNotificationsResult> {
  const result: ProcessTodayMenuNotificationsResult = {
    prepared: false,
    batchId: null,
    inserted: 0,
    queued: 0,
    skipped: 0,
    failures: 0,
    diagnostics: null,
  };

  const { data: prepareData, error: prepareError } = await supabase.rpc(
    "worker_prepare_today_menu_batch",
    { p_as_of: options.asOf ?? new Date().toISOString() },
  );

  if (prepareError) {
    throw new Error(`Today menu batch prepare failed: ${prepareError.message}`);
  }

  const diagnostics = parsePrepareDiagnostics(prepareData);
  result.diagnostics = diagnostics;

  if (diagnostics?.action !== "prepared") {
    return result;
  }

  result.prepared = true;
  result.batchId = diagnostics.batchId ?? null;
  result.inserted = diagnostics.inserted ?? 0;

  if (options.dryRun) {
    return result;
  }

  const { data: templateRow, error: templateError } = await supabase.rpc(
    "worker_get_notification_email_template",
    { p_event_key: "staff.today_menu" },
  );

  if (templateError) {
    throw new Error(`Today menu template load failed: ${templateError.message}`);
  }

  const template = (templateRow as Array<Record<string, string>> | null)?.[0];
  if (!template) {
    throw new Error("Today menu template is not configured");
  }

  const appOrigin = getApplicationOrigin();

  const { data: pendingRows, error: pendingError } = await supabase.rpc(
    "worker_list_pending_today_menu_deliveries",
    { p_limit: 200 },
  );

  if (pendingError) {
    throw new Error(`Today menu pending list failed: ${pendingError.message}`);
  }

  for (const row of (pendingRows ?? []) as PendingDeliveryRow[]) {
    const rendered = await buildTodayMenuRenderedEmail(supabase, {
      orderDate: row.operational_date,
      firstName: firstNameFromFullName(row.recipient_name, row.recipient_email),
      appOrigin,
      subjectTemplate: template.subject_template,
      bodyHtmlTemplate: template.body_html_template,
      bodyTextTemplate: template.body_text_template ?? "",
    });

    if (!rendered) {
      result.skipped += 1;
      continue;
    }

    const { error: queueError } = await supabase.rpc("worker_queue_today_menu_delivery", {
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
