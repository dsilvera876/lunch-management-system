export const NOTIFICATION_EMAIL_DELIVERY_PATH = "/admin/settings/email/delivery";
export const NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH =
  "/admin/settings/email/delivery/history";

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
