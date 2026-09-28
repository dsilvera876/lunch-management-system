import type { SupabaseClient } from "@supabase/supabase-js";

import type { EnqueueEmailDeliveryInput } from "@/lib/mail/email-queue-types";

export type EnqueueEmailDeliveryResult =
  | { success: true; queueId: string }
  | { success: false; error: string };

export async function enqueueEmailDelivery(
  supabase: SupabaseClient,
  input: EnqueueEmailDeliveryInput,
): Promise<EnqueueEmailDeliveryResult> {
  const { data, error } = await supabase.rpc("service_enqueue_email_delivery", {
    p_message_type: input.messageType,
    p_recipient_email: input.recipientEmail,
    p_subject: input.subject,
    p_text_body: input.textBody,
    p_html_body: input.htmlBody,
    p_correlation_type: input.correlationType ?? null,
    p_correlation_id: input.correlationId ?? null,
    p_supersede_active: input.supersedeActive ?? false,
  });

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Unable to enqueue email delivery.",
    };
  }

  return { success: true, queueId: String(data) };
}
