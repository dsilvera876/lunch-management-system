import { createClient } from "@/lib/supabase/server";
import type {
  NotificationDeliveryBatchStatus,
  NotificationDeliveryRecipientStatus,
  NotificationProcessingStatus,
} from "@/lib/notification-delivery";

export type NotificationDeliveryDashboardSummary = {
  totalCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
};

export type NotificationDeliveryBatchRow = {
  batchId: string;
  eventKey: string;
  eventName: string;
  operationalDate: string;
  createdAt: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  batchStatus: NotificationDeliveryBatchStatus;
};

export type NotificationDeliveryBatchDetail = NotificationDeliveryBatchRow;

export type NotificationDeliveryRecipientRow = {
  deliveryId: string;
  recipientName: string;
  recipientEmail: string | null;
  status: NotificationDeliveryRecipientStatus;
  sentAt: string | null;
  transportAttempts: number;
  lastError: string | null;
};

export type NotificationDeliveryContentSample = {
  deliveryId: string;
  renderedSubject: string | null;
  renderedTextBody: string | null;
  renderedHtmlBody: string | null;
};

export type NotificationProcessingRunRow = {
  runId: string;
  eventKey: string;
  eventName: string;
  operationalDate: string;
  scheduledSendTime: string;
  lastCheckedAt: string;
  firstCheckedAt?: string;
  runCount: number;
  candidateCount: number;
  eligibleCount: number;
  generatedCount: number;
  queuedCount: number;
  processingStatus: NotificationProcessingStatus;
  prepareReason: string | null;
  skipReasonCounts: Record<string, number>;
  deliveryBatchId: string | null;
};

function mapSkipReasonCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = Number(value ?? 0);
  }
  return out;
}

function mapProcessingRunRow(raw: Record<string, unknown>): NotificationProcessingRunRow {
  return {
    runId: String(raw.run_id),
    eventKey: String(raw.event_key),
    eventName: String(raw.event_name),
    operationalDate: String(raw.operational_date),
    scheduledSendTime: String(raw.scheduled_send_time),
    lastCheckedAt: String(raw.last_checked_at),
    firstCheckedAt: raw.first_checked_at ? String(raw.first_checked_at) : undefined,
    runCount: Number(raw.run_count ?? 0),
    candidateCount: Number(raw.candidate_count ?? 0),
    eligibleCount: Number(raw.eligible_count ?? 0),
    generatedCount: Number(raw.generated_count ?? 0),
    queuedCount: Number(raw.queued_count ?? 0),
    processingStatus: String(raw.processing_status) as NotificationProcessingStatus,
    prepareReason: raw.prepare_reason ? String(raw.prepare_reason) : null,
    skipReasonCounts: mapSkipReasonCounts(raw.skip_reason_counts),
    deliveryBatchId: raw.delivery_batch_id ? String(raw.delivery_batch_id) : null,
  };
}

function mapBatchRow(raw: Record<string, unknown>): NotificationDeliveryBatchRow {
  return {
    batchId: String(raw.batch_id),
    eventKey: String(raw.event_key),
    eventName: String(raw.event_name),
    operationalDate: String(raw.operational_date),
    createdAt: String(raw.created_at),
    recipientCount: Number(raw.recipient_count ?? 0),
    sentCount: Number(raw.sent_count ?? 0),
    failedCount: Number(raw.failed_count ?? 0),
    pendingCount: Number(raw.pending_count ?? 0),
    batchStatus: String(raw.batch_status) as NotificationDeliveryBatchStatus,
  };
}

export async function loadNotificationDeliveryDashboard(from: string, to: string) {
  const supabase = await createClient();

  const [
    { data: summaryRow, error: summaryError },
    { data: recentRows, error: recentError },
    { data: processingRows, error: processingError },
  ] = await Promise.all([
    supabase.rpc("get_notification_delivery_dashboard", {
      p_from: from,
      p_to: to,
    }),
    supabase.rpc("list_notification_delivery_batches", {
      p_from: from,
      p_to: to,
      p_event_key: null,
      p_status: null,
      p_limit: 10,
      p_offset: 0,
    }),
    supabase.rpc("list_notification_processing_runs", {
      p_from: from,
      p_to: to,
      p_limit: 10,
      p_offset: 0,
    }),
  ]);

  if (summaryError) {
    throw new Error(summaryError.message);
  }

  if (recentError) {
    throw new Error(recentError.message);
  }

  if (processingError) {
    throw new Error(processingError.message);
  }

  const summaryRaw = (summaryRow as Record<string, unknown>[] | null)?.[0] ?? {};

  const summary: NotificationDeliveryDashboardSummary = {
    totalCount: Number(summaryRaw.total_count ?? 0),
    sentCount: Number(summaryRaw.sent_count ?? 0),
    failedCount: Number(summaryRaw.failed_count ?? 0),
    pendingCount: Number(summaryRaw.pending_count ?? 0),
  };

  const recent = ((recentRows ?? []) as Record<string, unknown>[]).map(mapBatchRow);
  const processing = ((processingRows ?? []) as Record<string, unknown>[]).map(mapProcessingRunRow);

  return { summary, recent, processing };
}

export async function loadNotificationProcessingRunDetail(runId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_processing_run", {
    p_run_id: runId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = (data as Record<string, unknown>[] | null)?.[0];
  if (!raw) {
    return null;
  }

  return mapProcessingRunRow(raw);
}

export async function loadNotificationDeliveryHistory(input: {
  from: string;
  to: string;
  eventKey: string | null;
  status: string | null;
  page: number;
  pageSize: number;
}) {
  const supabase = await createClient();
  const offset = (input.page - 1) * input.pageSize;

  const { data, error } = await supabase.rpc("list_notification_delivery_batches", {
    p_from: input.from,
    p_to: input.to,
    p_event_key: input.eventKey,
    p_status: input.status,
    p_limit: input.pageSize + 1,
    p_offset: offset,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapBatchRow);
  const hasMore = rows.length > input.pageSize;

  return {
    rows: hasMore ? rows.slice(0, input.pageSize) : rows,
    hasMore,
  };
}

export async function loadNotificationDeliveryBatchDetail(batchId: string) {
  const supabase = await createClient();

  const [
    { data: detailRows, error: detailError },
    { data: recipientRows, error: recipientError },
    { data: contentRows, error: contentError },
  ] = await Promise.all([
    supabase.rpc("get_notification_delivery_batch_detail", { p_batch_id: batchId }),
    supabase.rpc("list_notification_delivery_recipients", { p_batch_id: batchId }),
    supabase.rpc("get_notification_delivery_content_sample", { p_batch_id: batchId }),
  ]);

  if (detailError) {
    throw new Error(detailError.message);
  }

  if (recipientError) {
    throw new Error(recipientError.message);
  }

  if (contentError) {
    throw new Error(contentError.message);
  }

  const detailRaw = (detailRows as Record<string, unknown>[] | null)?.[0];
  if (!detailRaw) {
    return null;
  }

  const detail = mapBatchRow({
    batch_id: detailRaw.batch_id,
    event_key: detailRaw.event_key,
    event_name: detailRaw.event_name,
    operational_date: detailRaw.operational_date,
    created_at: detailRaw.created_at,
    recipient_count: detailRaw.recipient_count,
    sent_count: detailRaw.sent_count,
    failed_count: detailRaw.failed_count,
    pending_count: detailRaw.pending_count,
    batch_status: detailRaw.batch_status,
  });

  const recipients: NotificationDeliveryRecipientRow[] = (
    (recipientRows ?? []) as Record<string, unknown>[]
  ).map((row) => ({
    deliveryId: String(row.delivery_id),
    recipientName: String(row.recipient_name ?? ""),
    recipientEmail: row.recipient_email ? String(row.recipient_email) : null,
    status: String(row.status) as NotificationDeliveryRecipientStatus,
    sentAt: row.sent_at ? String(row.sent_at) : null,
    transportAttempts: Number(row.transport_attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : null,
  }));

  const contentRaw = (contentRows as Record<string, unknown>[] | null)?.[0];
  const content: NotificationDeliveryContentSample | null = contentRaw
    ? {
        deliveryId: String(contentRaw.delivery_id),
        renderedSubject: contentRaw.rendered_subject
          ? String(contentRaw.rendered_subject)
          : null,
        renderedTextBody: contentRaw.rendered_text_body
          ? String(contentRaw.rendered_text_body)
          : null,
        renderedHtmlBody: contentRaw.rendered_html_body
          ? String(contentRaw.rendered_html_body)
          : null,
      }
    : null;

  return { detail, recipients, content };
}
