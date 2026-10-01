import type { SupabaseClient } from "@supabase/supabase-js";

import { formatHumanDate } from "@/lib/format";
import { renderNotificationTemplate } from "@/lib/notification-template";
import { firstNameFromFullName } from "@/lib/today-menu-notification-content";

export type DeadlineReminderRenderedEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

function formatOrderingDeadline(deadlineIso: string): string {
  const date = new Date(deadlineIso);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Jamaica",
  }).format(date);
}

export async function buildDeadlineReminderRenderedEmail(
  supabase: SupabaseClient,
  input: {
    orderDate: string;
    firstName: string;
    appOrigin: string;
    subjectTemplate: string;
    bodyHtmlTemplate: string;
    bodyTextTemplate: string;
  },
): Promise<DeadlineReminderRenderedEmail | null> {
  const { data: orderDeadline, error } = await supabase.rpc("order_deadline_for_order_date", {
    p_order_date: input.orderDate,
  });

  if (error || !orderDeadline) {
    return null;
  }

  const orderUrl = `${input.appOrigin.replace(/\/$/, "")}/lunch`;

  const variables = {
    first_name: input.firstName,
    order_date: formatHumanDate(input.orderDate),
    ordering_deadline: formatOrderingDeadline(String(orderDeadline)),
    order_url: orderUrl,
  };

  return {
    subject: renderNotificationTemplate(input.subjectTemplate, variables),
    htmlBody: renderNotificationTemplate(input.bodyHtmlTemplate, variables),
    textBody: renderNotificationTemplate(input.bodyTextTemplate, variables),
  };
}

export { firstNameFromFullName };
