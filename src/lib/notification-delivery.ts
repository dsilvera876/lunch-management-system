export const NOTIFICATION_EMAIL_DELIVERY_PATH = "/admin/settings/email/delivery";
export const NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH =
  "/admin/settings/email/delivery/history";

export function notificationProcessingPath(runId: string): string {
  return `${NOTIFICATION_EMAIL_DELIVERY_PATH}/processing/${runId}`;
}

export type NotificationProcessingStatus = "skipped" | "generated" | "partially_generated" | "error";

export function notificationProcessingStatusLabel(status: string): string {
  switch (status) {
    case "generated":
      return "Generated";
    case "partially_generated":
      return "Partially generated";
    case "error":
      return "Error";
    case "skipped":
    default:
      return "Skipped";
  }
}

const SKIP_REASON_LABELS: Record<string, string> = {
  preference_disabled: "Preference disabled",
  account_inactive: "Account inactive",
  not_lunch_participant: "Not a lunch participant",
  no_email: "No valid email",
  business_day_closed: "Business day closed",
  closed_business_day: "Business day closed",
  no_applicable_menu: "No applicable menu",
  no_menu: "No applicable menu",
  ordering_closed: "Ordering closed",
  period_finalized: "Period finalized",
  globally_disabled: "Globally disabled",
  already_generated: "Already generated",
  already_ordered: "Already ordered",
  outside_send_window: "Outside send window",
  outside_window: "Outside send window",
  profile_not_found: "Profile not found",
};

export function formatNotificationSkipReasonCounts(counts: Record<string, number> | null | undefined): string {
  if (!counts || Object.keys(counts).length === 0) {
    return "—";
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${SKIP_REASON_LABELS[key] ?? key.replace(/_/g, " ")}: ${count}`)
    .join(" · ");
}

export type NotificationDeliveryBatchStatus = "pending" | "sent" | "failed" | "partial";

export type NotificationDeliveryRecipientStatus =
  | "pending"
  | "queued"
  | "sent"
  | "failed"
  | "skipped";

export function notificationDeliveryBatchStatusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "partial":
      return "Partial";
    case "pending":
    default:
      return "Pending";
  }
}

export function notificationDeliveryRecipientStatusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "queued":
      return "Queued";
    case "skipped":
      return "Skipped";
    case "pending":
    default:
      return "Pending";
  }
}

export function notificationDeliveryDateRangePresetDays(days: number): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
