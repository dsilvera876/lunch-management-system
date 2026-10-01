import type { SupabaseClient } from "@supabase/supabase-js";

import { getApplicationOrigin } from "@/lib/request-origin";
import {
  buildTodayMenuRenderedEmail,
  firstNameFromFullName,
} from "@/lib/today-menu-notification-content";

export type ProcessTodayMenuNotificationsResult = {
  prepared: boolean;
  batchId: string | null;
  inserted: number;
  queued: number;
  skipped: number;
  failures: number;
};

type PendingDeliveryRow = {
  delivery_id: string;
  profile_id: string;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

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
  };

  const { data: prepareData, error: prepareError } = await supabase.rpc(
    "worker_prepare_today_menu_batch",
    { p_as_of: options.asOf ?? new Date().toISOString() },
  );

  if (prepareError) {
    throw new Error(`Today menu batch prepare failed: ${prepareError.message}`);
  }

  const prepare = prepareData as {
    action?: string;
    batch_id?: string;
    inserted?: number;
  };

  if (prepare.action !== "prepared") {
    return result;
  }

  result.prepared = true;
  result.batchId = prepare.batch_id ?? null;
  result.inserted = prepare.inserted ?? 0;

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
