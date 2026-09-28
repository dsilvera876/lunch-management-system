import {
  buildHrPendingSignupApprovalAlert,
  type HrPendingSignupApprovalAlert,
} from "@/lib/hr-pending-signup-approvals";

export type AppNotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string;
  actionLabel: string;
};

export function hrSignupApprovalNotificationItems(
  pendingCount: number,
): AppNotificationItem[] {
  const alert = buildHrPendingSignupApprovalAlert(pendingCount);
  if (!alert) {
    return [];
  }

  return [
    {
      id: "hr-signup-approval",
      title: "Pending user approval",
      message: alert.message,
      href: alert.href,
      actionLabel: alert.actionLabel,
    },
  ];
}

export function buildAppNotifications(
  pendingHrSignupCount: number,
): AppNotificationItem[] {
  return hrSignupApprovalNotificationItems(pendingHrSignupCount);
}

export function getAppNotificationBadgeCount(items: AppNotificationItem[]): number {
  return items.length;
}

export type { HrPendingSignupApprovalAlert };
