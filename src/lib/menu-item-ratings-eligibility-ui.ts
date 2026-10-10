import type { StaffProviderOrder } from "@/lib/staff-my-orders";

/**
 * Whether to show post-delivery menu-item rating UI for an order line.
 * Submit/update eligibility remains authoritative in database RPCs.
 */
export function isProviderOrderEligibleForMenuItemRatingsUi(
  order: Pick<StaffProviderOrder, "status" | "deliveryState">,
): boolean {
  if (order.status === "cancelled") {
    return false;
  }

  if (order.deliveryState === "pending" || order.deliveryState === "issue_open") {
    return false;
  }

  return (
    order.status === "fulfilled" ||
    order.deliveryState === "delivered" ||
    order.deliveryState === "resolved"
  );
}
