import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDeadline } from "@/lib/format";
import { HR_SIGNUP_APPROVALS_PATH } from "@/lib/hr-pending-signup-approvals";
import { renderNotificationTemplate } from "@/lib/notification-template";

export type HrPendingSignupRenderedEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

export type PendingHrSignupDeliveryRow = {
  delivery_id: string;
  event_key: string;
  signup_request_id: string;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

export function buildHrPendingSignupReviewUrl(appOrigin: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}${HR_SIGNUP_APPROVALS_PATH}`;
}

export async function loadHrPendingSignupNotificationContext(
  supabase: SupabaseClient,
  signupRequestId: string,
): Promise<{
  requesterName: string;
  requesterEmail: string;
  requestedAt: string;
} | null> {
  const { data, error } = await supabase.rpc("worker_get_hr_pending_signup_notification_context", {
    p_signup_request_id: signupRequestId,
  });

  if (error) {
    throw new Error(`HR signup notification context failed: ${error.message}`);
  }

  const row = (data as Array<Record<string, string>> | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    requesterName: String(row.requester_name),
    requesterEmail: String(row.requester_email),
    requestedAt: String(row.requested_at),
  };
}

export function buildHrPendingSignupRenderedEmail(
  context: {
    requesterName: string;
    requesterEmail: string;
    requestedAt: string;
  },
  appOrigin: string,
  templates: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): HrPendingSignupRenderedEmail {
  const variables = {
    requester_name: context.requesterName,
    requester_email: context.requesterEmail,
    requested_at: formatDeadline(context.requestedAt),
    review_url: buildHrPendingSignupReviewUrl(appOrigin),
  };

  return {
    subject: renderNotificationTemplate(templates.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(templates.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(templates.bodyTextTemplate, variables),
  };
}
