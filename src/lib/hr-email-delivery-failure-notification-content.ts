import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDeadline } from "@/lib/format";
import { renderNotificationTemplate } from "@/lib/notification-template";

const PROVIDER_FOLLOW_UP_HTML =
  "<p>The lunch provider may not have received the order email. Please use the normal provider contact process if immediate confirmation is required.</p>";

const PROVIDER_FOLLOW_UP_TEXT =
  "The lunch provider may not have received the order email. Please use the normal provider contact process if immediate confirmation is required.";

export type HrEmailDeliveryFailureRenderedEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

export type PendingHrEmailDeliveryFailureRow = {
  delivery_id: string;
  event_key: string;
  failed_email_queue_id: string | null;
  failed_provider_dispatch_id: string | null;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

export async function loadHrEmailDeliveryFailureNotificationContext(
  supabase: SupabaseClient,
  deliveryId: string,
): Promise<{
  emailType: string;
  recipient: string;
  failedAt: string;
  providerFollowUp: boolean;
} | null> {
  const { data, error } = await supabase.rpc("worker_get_hr_email_delivery_failure_context", {
    p_delivery_id: deliveryId,
  });

  if (error) {
    throw new Error(`HR email failure notification context failed: ${error.message}`);
  }

  const row = (data as Array<Record<string, string | boolean>> | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    emailType: String(row.email_type),
    recipient: String(row.recipient),
    failedAt: String(row.failed_at),
    providerFollowUp: row.provider_follow_up === true,
  };
}

export function buildHrEmailDeliveryFailureRenderedEmail(
  context: {
    emailType: string;
    recipient: string;
    failedAt: string;
    providerFollowUp: boolean;
  },
  templates: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): HrEmailDeliveryFailureRenderedEmail {
  const variables = {
    email_type: context.emailType,
    recipient: context.recipient,
    failed_at: formatDeadline(context.failedAt),
  };

  let htmlBody = renderNotificationTemplate(templates.bodyHtmlTemplate, variables);
  let textBody = renderNotificationTemplate(templates.bodyTextTemplate, variables);

  if (context.providerFollowUp) {
    htmlBody += PROVIDER_FOLLOW_UP_HTML;
    textBody += `\n\n${PROVIDER_FOLLOW_UP_TEXT}`;
  }

  return {
    subject: renderNotificationTemplate(templates.subjectTemplate, variables),
    htmlBody,
    textBody,
  };
}
