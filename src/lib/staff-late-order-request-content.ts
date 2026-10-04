import type { SupabaseClient } from "@supabase/supabase-js";

import { renderNotificationTemplate } from "@/lib/notification-template";

export type PendingHrLateOrderSubmittedRow = {
  delivery_id: string;
  event_key: string;
  profile_id: string;
  recipient_email: string;
  staff_late_order_request_id: string;
};

export type PendingStaffLateOrderRequestStatusRow = {
  delivery_id: string;
  event_key: string;
  profile_id: string;
  recipient_email: string;
  staff_late_order_request_id: string;
};

export async function loadHrLateOrderSubmittedContext(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { data, error } = await supabase.rpc("worker_get_hr_late_order_submitted_context", {
    p_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = (data as Array<Record<string, string>> | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    employeeName: String(row.employee_name ?? ""),
    providerName: String(row.provider_name ?? ""),
    deliveryDate: String(row.delivery_date ?? ""),
    requestedSummary: String(row.requested_summary ?? ""),
    submittedAt: String(row.submitted_at ?? ""),
  };
}

export function buildHrLateOrderSubmittedRenderedEmail(
  context: NonNullable<Awaited<ReturnType<typeof loadHrLateOrderSubmittedContext>>>,
  appOrigin: string,
  template: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
) {
  const reviewUrl = `${appOrigin}/admin/late-orders`;
  const variables = {
    employee_name: context.employeeName,
    provider_name: context.providerName,
    delivery_date: context.deliveryDate,
    requested_summary: context.requestedSummary,
    submitted_at: context.submittedAt,
    review_url: reviewUrl,
  };

  return {
    subject: renderNotificationTemplate(template.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(template.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(template.bodyTextTemplate, variables),
  };
}

export async function loadStaffLateOrderRequestStatusContext(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { data, error } = await supabase.rpc("worker_get_staff_late_order_request_status_context", {
    p_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = (data as Array<Record<string, string>> | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    firstName: String(row.first_name ?? "there"),
    providerName: String(row.provider_name ?? ""),
    deliveryDate: String(row.delivery_date ?? ""),
    requestedSummary: String(row.requested_summary ?? ""),
    declineReason: String(row.decline_reason ?? ""),
  };
}

export function buildStaffLateOrderRequestStatusRenderedEmail(
  context: NonNullable<Awaited<ReturnType<typeof loadStaffLateOrderRequestStatusContext>>>,
  template: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
) {
  const variables = {
    first_name: context.firstName,
    provider_name: context.providerName,
    delivery_date: context.deliveryDate,
    requested_summary: context.requestedSummary,
    decline_reason: context.declineReason,
  };

  return {
    subject: renderNotificationTemplate(template.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(template.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(template.bodyTextTemplate, variables),
  };
}
