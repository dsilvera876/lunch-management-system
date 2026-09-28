import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmailQueueRow } from "@/lib/mail/email-queue-types";
import type { MailServiceDependencies } from "@/lib/mail/mail-service";
import { sendEmail } from "@/lib/mail/mail-service";

export type ProcessEmailQueueResult = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
};

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
  };

  const { data, error } = await supabase.rpc("worker_claim_email_delivery_queue", {
    p_limit: batchSize,
  });

  if (error) {
    throw new Error(`Email queue claim failed: ${error.message}`);
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapQueueRow);
  result.claimed = rows.length;

  if (options.dryRun) {
    console.log(`Dry run: claimed ${rows.length} email queue message(s); SMTP send skipped`);
    return result;
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
