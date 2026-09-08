export const DELIVERY_STATES = [
  "pending",
  "delivered",
  "issue_open",
  "resolved",
] as const;

export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const FINANCIAL_DISPOSITIONS = [
  "chargeable",
  "on_hold",
  "waived",
] as const;

export type FinancialDisposition = (typeof FINANCIAL_DISPOSITIONS)[number];

export const DELIVERY_ISSUE_TYPES = [
  "not_delivered",
  "wrong_order",
  "damaged",
  "provider_cancelled",
  "other",
] as const;

export type DeliveryIssueType = (typeof DELIVERY_ISSUE_TYPES)[number];

export const DELIVERY_RESOLUTION_TYPES = [
  "deliver_later_today",
  "deliver_next_business_day",
  "send_correct_later_today",
  "send_correct_next_business_day",
  "replacement_later_today",
  "replacement_next_business_day",
  "substitute_accepted",
  "no_replacement_no_charge",
  "other",
] as const;

export type DeliveryResolutionType = (typeof DELIVERY_RESOLUTION_TYPES)[number];

export const RECONCILIATION_FILTERS = [
  "all",
  "pending",
  "delivered",
  "issues",
  "resolved",
  "cancelled",
] as const;

export type ReconciliationFilter = (typeof RECONCILIATION_FILTERS)[number];

const ISSUE_LABELS: Record<DeliveryIssueType, string> = {
  not_delivered: "Not delivered",
  wrong_order: "Wrong order",
  damaged: "Damaged",
  provider_cancelled: "Provider cancelled",
  other: "Other",
};

const RESOLUTION_LABELS: Record<DeliveryResolutionType, string> = {
  deliver_later_today: "Deliver later today",
  deliver_next_business_day: "Deliver next business day",
  send_correct_later_today: "Send correct order later today",
  send_correct_next_business_day: "Send correct order next business day",
  replacement_later_today: "Replacement later today",
  replacement_next_business_day: "Replacement next business day",
  substitute_accepted: "Substitute accepted",
  no_replacement_no_charge: "No replacement / no charge",
  other: "Other",
};

export function getDeliveryIssueLabel(issueType: string | null | undefined): string {
  if (!issueType) {
    return "Issue";
  }

  return ISSUE_LABELS[issueType as DeliveryIssueType] ?? issueType;
}

export function getDeliveryResolutionLabel(
  resolutionType: string | null | undefined,
): string {
  if (!resolutionType) {
    return "Not set";
  }

  return RESOLUTION_LABELS[resolutionType as DeliveryResolutionType] ?? resolutionType;
}

export function getOperationalDisplayState(input: {
  status: string;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
}): string {
  if (input.status === "cancelled") {
    return "Cancelled";
  }

  if (input.deliveryState === "issue_open") {
    return "Delivery issue";
  }

  if (input.deliveryState === "resolved" && input.financialDisposition === "waived") {
    return "Resolved — no charge";
  }

  if (input.deliveryState === "resolved") {
    return "Resolved";
  }

  if (input.deliveryState === "delivered") {
    return "Delivered";
  }

  return "Pending";
}

export function getStaffDeliveryStatusLabel(input: {
  status: string;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
}): string | null {
  if (input.status === "cancelled") {
    return null;
  }

  if (input.deliveryState === "issue_open" || input.financialDisposition === "on_hold") {
    return "Delivery issue — charge on hold";
  }

  if (input.deliveryState === "resolved" && input.financialDisposition === "waived") {
    return "Resolved — no charge";
  }

  return null;
}

export function matchesReconciliationFilter(
  filter: ReconciliationFilter,
  order: {
    status: string;
    deliveryState: DeliveryState;
  },
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "cancelled") {
    return order.status === "cancelled";
  }

  if (order.status === "cancelled") {
    return false;
  }

  switch (filter) {
    case "pending":
      return order.deliveryState === "pending";
    case "delivered":
      return order.deliveryState === "delivered";
    case "issues":
      return order.deliveryState === "issue_open";
    case "resolved":
      return order.deliveryState === "resolved";
    default:
      return true;
  }
}

export function countsForReconciliationFilter(orders: Array<{
  status: string;
  deliveryState: DeliveryState;
}>): Record<ReconciliationFilter, number> {
  const counts: Record<ReconciliationFilter, number> = {
    all: orders.length,
    pending: 0,
    delivered: 0,
    issues: 0,
    resolved: 0,
    cancelled: 0,
  };

  for (const order of orders) {
    for (const filter of RECONCILIATION_FILTERS) {
      if (filter !== "all" && matchesReconciliationFilter(filter, order)) {
        counts[filter] += 1;
      }
    }
  }

  return counts;
}

export function isPreparationQualifyingOrder(input: {
  status: string;
  financialDisposition: FinancialDisposition;
}): boolean {
  return input.status !== "cancelled" && input.financialDisposition !== "waived";
}

export function canMarkDelivered(input: {
  status: string;
  deliveryState: DeliveryState;
}): boolean {
  return input.status !== "cancelled" && input.deliveryState === "pending";
}

export function canReportIssue(input: {
  status: string;
}): boolean {
  return input.status !== "cancelled";
}

export function canManageOpenIssue(deliveryState: DeliveryState): boolean {
  return deliveryState === "issue_open";
}

export function formatFinalizationBlockedMessage(unreconciledCount: number): string {
  return `This lunch period cannot be finalized because ${unreconciledCount} order${unreconciledCount === 1 ? "" : "s"} still require delivery reconciliation.`;
}
