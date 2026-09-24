import {
  addCalendarDays,
  getDeliveryDateForOrderDate,
  getOrderDateForDeliveryDate,
} from "./datetime";

export { addCalendarDays, getOrderDateForDeliveryDate };

export type LateOrderCycleContext = {
  deliveryDate: string;
  orderDate: string;
  lateOrderingOpen: boolean;
};

/**
 * Delivery dates shown on the Late Orders page (actionable cycles only).
 *
 * - After today's company cutoff: include the next business delivery from today as order day.
 * - On a delivery morning: include today's delivery while provider late deadlines may still be open.
 */
/** Candidate delivery dates the Late Orders page may load (today + next from today). */
export function candidateLateOrderDeliveryDates(today: string): string[] {
  const dates = new Set<string>([today]);
  const nextDelivery = getDeliveryDateForOrderDate(today);

  if (nextDelivery) {
    dates.add(nextDelivery);
  }

  return [...dates].sort();
}

export function resolveActionableLateOrderDeliveryDates(input: {
  today: string;
  companyCutoffPassedForToday: boolean;
  cycles: LateOrderCycleContext[];
}): string[] {
  const dates = new Set<string>();
  const nextDelivery = getDeliveryDateForOrderDate(input.today);

  for (const cycle of input.cycles) {
    if (!cycle.lateOrderingOpen) {
      continue;
    }

    if (cycle.deliveryDate === input.today) {
      dates.add(input.today);
    }

    if (
      input.companyCutoffPassedForToday &&
      nextDelivery &&
      cycle.deliveryDate === nextDelivery
    ) {
      dates.add(nextDelivery);
    }
  }

  if (dates.size === 0 && input.companyCutoffPassedForToday && nextDelivery) {
    dates.add(nextDelivery);
  }

  return [...dates].sort();
}

export function resolvePrimaryLateOrderDeliveryDate(
  actionableDeliveryDates: string[],
  today: string,
): string {
  if (actionableDeliveryDates.length === 0) {
    return getDeliveryDateForOrderDate(today) ?? today;
  }

  const nextFromToday = getDeliveryDateForOrderDate(today);

  if (nextFromToday && actionableDeliveryDates.includes(nextFromToday)) {
    return nextFromToday;
  }

  return actionableDeliveryDates[0] ?? today;
}

export function shouldShowLateOrderProviderSummary(summary: {
  lateOrderingOpen: boolean;
  approvedUnsentCount: number;
  hasBlockingDispatch: boolean;
  attentionDispatchId: string | null;
  lateOrderCount: number;
}): boolean {
  if (summary.lateOrderingOpen) {
    return true;
  }

  if (summary.approvedUnsentCount > 0 || summary.hasBlockingDispatch || summary.attentionDispatchId) {
    return true;
  }

  return summary.lateOrderCount > 0;
}

export type LateOrderSnapshotWarningKind =
  | "none"
  | "historical_missing"
  | "current_pending"
  | "future_unavailable"
  | "invalid_cycle";

export function classifyLateOrderSnapshotWarning(input: {
  snapshotMissing: boolean;
  orderDate: string;
  jamaicaToday: string;
  deliveryDate: string;
}): { kind: LateOrderSnapshotWarningKind; message: string | null } {
  if (!input.snapshotMissing) {
    return { kind: "none", message: null };
  }

  if (input.orderDate < input.jamaicaToday) {
    return {
      kind: "historical_missing",
      message:
        "Late ordering is unavailable for this delivery date because the saved menu for that order cycle was not recorded.",
    };
  }

  if (input.orderDate === input.jamaicaToday) {
    return {
      kind: "current_pending",
      message:
        "Today's menu is still being prepared. Choose this provider again in a moment, or create the late order once the menu is ready.",
    };
  }

  const mappedOrderDate = getOrderDateForDeliveryDate(input.deliveryDate);

  if (!mappedOrderDate) {
    return {
      kind: "invalid_cycle",
      message: "This delivery date is not part of a valid order cycle.",
    };
  }

  return {
    kind: "future_unavailable",
    message: "The menu for this delivery date is not available yet.",
  };
}
