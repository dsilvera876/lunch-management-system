import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmailQueueRow } from "@/lib/mail/email-queue-types";
import type { MailServiceDependencies } from "@/lib/mail/mail-service";
import { sendEmail } from "@/lib/mail/mail-service";

export type ProcessEmailQueueResult = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  diagnostics: EmailQueueDiagnostics | null;
};

export type EmailQueueDiagnostics = {
  pendingReady: number;
  pendingFuture: number;
  processing: number;
  processingStale: number;
};

function mapQueueDiagnostics(raw: unknown): EmailQueueDiagnostics {
  const diagnostics =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    pendingReady: Number(diagnostics.pending_ready ?? 0),
    pendingFuture: Number(diagnostics.pending_future ?? 0),
    processing: Number(diagnostics.processing ?? 0),
    processingStale: Number(diagnostics.processing_stale ?? 0),
  };
}

async function loadQueueDiagnostics(
  supabase: SupabaseClient,
): Promise<EmailQueueDiagnostics> {
  const { data, error } = await supabase.rpc(
    "worker_email_delivery_queue_claim_diagnostics",
  );

  if (error) {
    throw new Error(`Email queue diagnostics failed: ${error.message}`);
  }

  return mapQueueDiagnostics(data);
}

function mapQueueRow(raw: Record<string, unknown>): EmailQueueRow {
  return {
    id: String(raw.id),
    message_type: String(raw.message_type),
    recipient_email: String(raw.recipient_email),
    subject: String(raw.subject),
    text_body: String(raw.text_body),
    html_body: String(raw.html_body),
    status: raw.status as EmailQueueRow["status"],
    attempts: Number(raw.attempts ?? 0),
    correlation_type: (raw.correlation_type as string | null) ?? null,
    correlation_id: (raw.correlation_id as string | null) ?? null,
  };
}

export async function processEmailDeliveryQueue(
  supabase: SupabaseClient,
  options: { batchSize?: number; dryRun?: boolean } = {},
  mailDependencies: MailServiceDependencies = {},
): Promise<ProcessEmailQueueResult> {
  const batchSize = options.batchSize ?? 10;
  const result: ProcessEmailQueueResult = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    diagnostics: null,
  };

  if (options.dryRun) {
    result.diagnostics = await loadQueueDiagnostics(supabase);
    console.log(
      [
        "Dry run: email queue unchanged; SMTP send skipped",
        `pending_ready=${result.diagnostics.pendingReady}`,
        `pending_future=${result.diagnostics.pendingFuture}`,
        `processing=${result.diagnostics.processing}`,
        `processing_stale=${result.diagnostics.processingStale}`,
      ].join(" "),
    );
    return result;
  }

  const { data, error } = await supabase.rpc("worker_claim_email_delivery_queue", {
    p_limit: batchSize,
  });

  if (error) {
    throw new Error(`Email queue claim failed: ${error.message}`);
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapQueueRow);
  result.claimed = rows.length;

  if (rows.length === 0) {
    try {
      result.diagnostics = await loadQueueDiagnostics(supabase);
      const diagnostics = result.diagnostics;

      if (diagnostics.pendingReady + diagnostics.pendingFuture + diagnostics.processing > 0) {
        console.warn(
          `Email queue claim returned 0 rows; pending_ready=${diagnostics.pendingReady} pending_future=${diagnostics.pendingFuture} processing=${diagnostics.processing} processing_stale=${diagnostics.processingStale}`,
        );
      }
    } catch {
      // Claim diagnostics are best-effort during normal processing.
    }
  }

  for (const row of rows) {
    const { data: shouldDeliver, error: shouldDeliverError } = await supabase.rpc(
      "worker_should_deliver_email_queue_message",
      { p_queue_id: row.id },
    );

    if (shouldDeliverError) {
      throw new Error(
        `Email queue delivery validation failed: ${shouldDeliverError.message}`,
      );
    }

    if (shouldDeliver !== true) {
      const { error: completeError } = await supabase.rpc("worker_complete_email_delivery", {
        p_queue_id: row.id,
        p_outcome: "failed",
        p_error: "Delivery cancelled: account or signup context no longer valid.",
      });

      if (completeError) {
        throw new Error(`Email queue skip finalize failed: ${completeError.message}`);
      }

      result.failed += 1;
      continue;
    }

    const sendResult = await sendEmail(
      {
        to: row.recipient_email,
        subject: row.subject,
        text: row.text_body,
        html: row.html_body,
      },
      mailDependencies,
    );

    if (sendResult.success) {
      const { error: completeError } = await supabase.rpc("worker_complete_email_delivery", {
        p_queue_id: row.id,
        p_outcome: "sent",
        p_error: null,
      });

      if (completeError) {
        throw new Error(`Email queue finalize failed: ${completeError.message}`);
      }

      result.sent += 1;
      continue;
    }

    const { error: completeError } = await supabase.rpc("worker_complete_email_delivery", {
      p_queue_id: row.id,
      p_outcome: "failed",
      p_error: sendResult.error,
    });

    if (completeError) {
      throw new Error(`Email queue failure finalize failed: ${completeError.message}`);
    }

    if (row.attempts >= 5) {
      result.failed += 1;
    } else {
      result.retried += 1;
    }
  }

  return result;
}
