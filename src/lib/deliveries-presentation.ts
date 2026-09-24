import {
  getOperationalDisplayState,
  type DeliveryState,
  type FinancialDisposition,
} from "@/lib/delivery-reconciliation";

export { lateOrderMajorCardClassName as deliveriesOfficeCardClassName } from "@/components/admin/late-orders/late-order-section-header";

export const DELIVERY_TOGGLE_ERROR_MESSAGE =
  "Could not update delivery. Try again.";

export type DeliveryStatusBadgeVariant =
  | "pending"
  | "delivered"
  | "issue"
  | "resolved"
  | "cancelled";

export function resolveDeliveryStatusBadgeVariant(order: {
  status: string;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
}): DeliveryStatusBadgeVariant {
  if (order.status === "cancelled") {
    return "cancelled";
  }

  if (order.deliveryState === "issue_open") {
    return "issue";
  }

  if (order.deliveryState === "resolved") {
    return "resolved";
  }

  if (order.deliveryState === "delivered") {
    return "delivered";
  }

  return "pending";
}

export function deliveryStatusBadgeClassName(
  variant: DeliveryStatusBadgeVariant,
): string {
  switch (variant) {
    case "delivered":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200/60";
    case "issue":
      return "bg-amber-50 text-amber-900 ring-amber-200/70";
    case "resolved":
      return "bg-teal-50 text-teal-900 ring-teal-200/60";
    case "cancelled":
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
    case "pending":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

export function formatDeliveryStatusBadgeLabel(order: {
  status: string;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
}): string {
  return getOperationalDisplayState(order);
}
