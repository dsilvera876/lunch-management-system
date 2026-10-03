import type { SupabaseClient } from "@supabase/supabase-js";

import { formatHumanDate } from "@/lib/format";
import { renderNotificationTemplate } from "@/lib/notification-template";
import { firstNameFromFullName } from "@/lib/today-menu-notification-content";

export type StaffLunchPeriodFinalizedRenderedEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

export type PendingStaffLunchPeriodFinalizedRow = {
  delivery_id: string;
  event_key: string;
  lunch_period_id: string;
  operational_date: string;
  recipient_email: string;
  recipient_name: string;
};

export function buildStaffLunchActivityUrl(appOrigin: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}/financials`;
}

export async function loadStaffLunchPeriodFinalizedNotificationContext(
  supabase: SupabaseClient,
  deliveryId: string,
  fallbackRecipientName: string,
  fallbackRecipientEmail: string,
): Promise<{
  firstName: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
} | null> {
  const { data, error } = await supabase.rpc("worker_get_staff_lunch_period_finalized_context", {
    p_delivery_id: deliveryId,
  });

  if (error) {
    throw new Error(
      `Staff lunch period finalized notification context failed: ${error.message}`,
    );
  }

  const row = (data as Array<Record<string, string>> | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    firstName: firstNameFromFullName(
      String(row.first_name ?? fallbackRecipientName),
      fallbackRecipientEmail,
    ),
    periodName: String(row.period_name),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
  };
}

export function buildStaffLunchPeriodFinalizedRenderedEmail(
  context: {
    firstName: string;
    periodName: string;
    periodStart: string;
    periodEnd: string;
  },
  appOrigin: string,
  templates: {
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): StaffLunchPeriodFinalizedRenderedEmail {
  const variables = {
    first_name: context.firstName,
    period_name: context.periodName,
    period_start: formatHumanDate(context.periodStart),
    period_end: formatHumanDate(context.periodEnd),
    account_url: buildStaffLunchActivityUrl(appOrigin),
  };

  return {
    subject: renderNotificationTemplate(templates.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(templates.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(templates.bodyTextTemplate, variables),
  };
}
