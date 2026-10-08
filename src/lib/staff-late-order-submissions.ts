import type { StaffLateOrderRequestRow } from "@/app/home/staff-late-order-request-actions";

export const MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB = "late-order-submissions" as const;

export const MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF =
  `/my-orders?tab=${MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB}`;

export type LateOrderSubmissionStatus =
  | "pending"
  | "fulfilled"
  | "declined"
  | "cancelled"
  | "expired";

export function normalizeLateOrderSubmissionStatus(status: string): LateOrderSubmissionStatus | string {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "fulfilled" ||
    normalized === "declined" ||
    normalized === "cancelled" ||
    normalized === "expired"
  ) {
    return normalized;
  }
  return normalized;
}

export function lateOrderRequestStatusBadgeStatus(status: string): string {
  return normalizeLateOrderSubmissionStatus(status);
}

export function sortLateOrderSubmissions(
  requests: StaffLateOrderRequestRow[],
): StaffLateOrderRequestRow[] {
  return [...requests].sort((a, b) => {
    const dateCompare = b.scheduled_delivery_date.localeCompare(a.scheduled_delivery_date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Active submission that prevents creating another for the same provider and delivery date. */
export function findBlockingLateOrderSubmission(
  requests: StaffLateOrderRequestRow[],
  providerId: string,
  deliveryDate: string,
): StaffLateOrderRequestRow | null {
  return (
    requests.find((request) => {
      if (request.provider_id !== providerId || request.scheduled_delivery_date !== deliveryDate) {
        return false;
      }
      const status = request.status.trim().toLowerCase();
      return status === "pending" || status === "fulfilled";
    }) ?? null
  );
}

/** True when the employee can still start a new submission (authoritative cycles or summary). */
export function shouldMountStaffLateOrderSubmissionDrawer(
  eligibleCycleCount: number,
  newLateOrderOpportunity: boolean,
): boolean {
  return eligibleCycleCount > 0 || newLateOrderOpportunity;
}
