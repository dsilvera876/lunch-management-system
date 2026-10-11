import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDeadline, formatHumanDate } from "@/lib/format";
import { NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH } from "@/lib/notification-delivery";
import { emailHtml, type TrustedEmailHtml } from "@/lib/email-html";
import {
  renderNotificationHtmlTemplate,
  renderNotificationSubjectTemplate,
  renderNotificationTextTemplate,
} from "@/lib/notification-template";

export type AdminEmailDeliveryFailureRenderedEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

export type AdminEmailDeliveryFailureSource =
  | "email_delivery_queue"
  | "provider_supplemental_dispatch"
  | "provider_primary_dispatch";

export type PendingAdminEmailDeliveryFailureRow = {
  delivery_id: string;
  event_key: string;
  failed_email_queue_id: string | null;
  failed_provider_dispatch_id: string | null;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

export function buildAdminEmailDeliveryMonitoringUrl(appOrigin: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}${NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH}`;
}

export type AdminEmailDeliveryFailureReviewContent = {
  reviewHtml: TrustedEmailHtml;
  reviewText: string;
};

export function buildAdminEmailDeliveryQueueFailureReviewContent(
  appOrigin: string,
): AdminEmailDeliveryFailureReviewContent {
  const deliveryUrl = buildAdminEmailDeliveryMonitoringUrl(appOrigin);
  return {
    reviewHtml: emailHtml`<p><a href="${deliveryUrl}">Review Email Delivery</a></p>`,
    reviewText: `Review Email Delivery:\n${deliveryUrl}`,
  };
}

function providerDispatchDetailParts(context: {
  providerName: string | null;
  scheduledDeliveryDate: string | null;
}): string[] {
  const detailParts: string[] = [];
  if (context.providerName) {
    detailParts.push(`Provider: ${context.providerName}`);
  }
  if (context.scheduledDeliveryDate) {
    detailParts.push(`Delivery date: ${formatHumanDate(context.scheduledDeliveryDate)}`);
  }
  return detailParts;
}

function providerDispatchDetailHtml(detailParts: string[]): TrustedEmailHtml {
  return detailParts.length > 0
    ? emailHtml`<p>${detailParts.join(". ")}.</p>`
    : emailHtml``;
}

export function buildAdminProviderPrimaryDispatchFailureReviewContent(context: {
  providerName: string | null;
  scheduledDeliveryDate: string | null;
}): AdminEmailDeliveryFailureReviewContent {
  const detailParts = providerDispatchDetailParts(context);

  const reviewHtml = emailHtml`<p><strong>Failure source:</strong> Provider primary lunch-order dispatch. This failure is not listed in Email Delivery monitoring.</p>${providerDispatchDetailHtml(detailParts)}<p>Investigate dispatch status on <strong>Admin → Today&apos;s Orders</strong> when you have HR operational access (HR role, or Admin/Owner with HR support scope). Otherwise coordinate with HR for provider follow-up.</p>`;

  const textDetail =
    detailParts.length > 0 ? `${detailParts.join(". ")}.\n\n` : "";

  const reviewText = `Failure source: Provider primary lunch-order dispatch. This failure is not listed in Email Delivery monitoring.

${textDetail}Investigate dispatch status on Admin → Today's Orders when you have HR operational access (HR role, or Admin/Owner with HR support scope). Otherwise coordinate with HR for provider follow-up.`;

  return { reviewHtml, reviewText };
}

export function buildAdminProviderSupplementalDispatchFailureReviewContent(context: {
  providerName: string | null;
  scheduledDeliveryDate: string | null;
}): AdminEmailDeliveryFailureReviewContent {
  const detailParts = providerDispatchDetailParts(context);

  const reviewHtml = emailHtml`<p><strong>Failure source:</strong> Provider supplemental late-order dispatch. This failure is not listed in Email Delivery monitoring.</p>${providerDispatchDetailHtml(detailParts)}<p>Investigate dispatch status on <strong>Admin → Late Orders</strong> when you have HR operational access (HR role, or Admin/Owner with HR support scope). Otherwise coordinate with HR for provider follow-up.</p>`;

  const textDetail =
    detailParts.length > 0 ? `${detailParts.join(". ")}.\n\n` : "";

  const reviewText = `Failure source: Provider supplemental late-order dispatch. This failure is not listed in Email Delivery monitoring.

${textDetail}Investigate dispatch status on Admin → Late Orders when you have HR operational access (HR role, or Admin/Owner with HR support scope). Otherwise coordinate with HR for provider follow-up.`;

  return { reviewHtml, reviewText };
}

export async function loadAdminEmailDeliveryFailureNotificationContext(
  supabase: SupabaseClient,
  deliveryId: string,
): Promise<{
  failureSource: AdminEmailDeliveryFailureSource;
  messageType: string;
  recipient: string;
  failedAt: string;
  errorSummary: string;
  providerName: string | null;
  scheduledDeliveryDate: string | null;
} | null> {
  const { data, error } = await supabase.rpc("worker_get_admin_email_delivery_failure_context", {
    p_delivery_id: deliveryId,
  });

  if (error) {
    throw new Error(`Admin email failure notification context failed: ${error.message}`);
  }

  const row = (data as Array<Record<string, string | null>> | null)?.[0];
  if (!row) {
    return null;
  }

  const failureSource = String(row.failure_source);
  if (
    failureSource !== "email_delivery_queue" &&
    failureSource !== "provider_supplemental_dispatch" &&
    failureSource !== "provider_primary_dispatch"
  ) {
    throw new Error(`Unknown admin email failure source: ${failureSource}`);
  }

  return {
    failureSource,
    messageType: String(row.message_type),
    recipient: String(row.recipient),
    failedAt: String(row.failed_at),
    errorSummary: String(row.error_summary),
    providerName: row.provider_name ? String(row.provider_name) : null,
    scheduledDeliveryDate: row.scheduled_delivery_date
      ? String(row.scheduled_delivery_date)
      : null,
  };
}

export function buildAdminEmailDeliveryFailureRenderedEmail(
  context: {
    failureSource: AdminEmailDeliveryFailureSource;
    messageType: string;
    recipient: string;
    failedAt: string;
    errorSummary: string;
    providerName: string | null;
    scheduledDeliveryDate: string | null;
  },
  appOrigin: string,
  templates: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): AdminEmailDeliveryFailureRenderedEmail {
  const review =
    context.failureSource === "email_delivery_queue"
      ? buildAdminEmailDeliveryQueueFailureReviewContent(appOrigin)
      : context.failureSource === "provider_primary_dispatch"
        ? buildAdminProviderPrimaryDispatchFailureReviewContent({
            providerName: context.providerName,
            scheduledDeliveryDate: context.scheduledDeliveryDate,
          })
        : buildAdminProviderSupplementalDispatchFailureReviewContent({
            providerName: context.providerName,
            scheduledDeliveryDate: context.scheduledDeliveryDate,
          });

  const textVariables = {
    message_type: context.messageType,
    recipient: context.recipient,
    failed_at: formatDeadline(context.failedAt),
    error_summary: context.errorSummary,
    review_html: review.reviewHtml.html,
    review_text: review.reviewText,
  };

  const htmlVariables = {
    ...textVariables,
    review_html: review.reviewHtml,
  };

  return {
    subject: renderNotificationSubjectTemplate(templates.subjectTemplate, textVariables),
    htmlBody: renderNotificationHtmlTemplate(templates.bodyHtmlTemplate, htmlVariables),
    textBody: renderNotificationTextTemplate(templates.bodyTextTemplate, textVariables),
  };
}
