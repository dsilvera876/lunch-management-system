import { getRelated } from "@/lib/format";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  groupMenuItemsByType,
  type MenuItemType,
} from "@/lib/menu-items";
import type { DeliveryState, FinancialDisposition } from "@/lib/delivery-reconciliation";
import { calculateMarginalOrderCheckout } from "@/lib/order-subsidy-preview";
export type MyOrdersTab = "upcoming" | "past" | "cancelled";

export type ProviderOrderLine = {
  name: string;
  quantity: number;
  itemType: MenuItemType;
  unitLabel: string;
  unitPrice: number;
  lineTotal: number;
};

export type StaffProviderOrder = {
  id: string;
  providerId: string;
  providerName: string;
  indexInGroup: number;
  groupOrderCount: number;
  status: string;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
  specialInstructions: string | null;
  mealQuantity: number | null;
  lines: ProviderOrderLine[];
  orderTotal: number;
  statusLabel: string;
  createdAt: string;
};

export type GroupedCheckout = {
  orderGroupId: string;
  deliveryDate: string;
  orderDate: string | null;
  placedAt: string;
  officeLocationName: string | null;
  providerOrders: StaffProviderOrder[];
  providerCount: number;
  orderCount: number;
  checkoutStatusLabel: string;
  checkoutStatusKind: "upcoming" | "submitted" | "delivered" | "cancelled" | "issue";
  subtotal: number;
  lunchSubsidy: number;
  youPay: number;
  payLabel: "You Pay" | "You Paid";
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationSummary: string | null;
};

export type StaffMyOrdersRawRow = {
  id: string;
  order_group_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  delivery_state: string;
  financial_disposition: string;
  special_instructions: string | null;
  meal_quantity: number | null;
  office_location_name: string | null;
  lunch_days: {
    lunch_date: string;
    order_date: string;
    order_deadline: string;
    lunch_providers: { id: string; name: string } | { id: string; name: string }[];
  } | {
    lunch_date: string;
    order_date: string;
    order_deadline: string;
    lunch_providers: { id: string; name: string } | { id: string; name: string }[];
  }[];
  order_items: Array<{
    quantity: number;
    unit_price: number;
    menu_items: {
      name: string;
      item_type: string;
      unit_label: string;
    } | {
      name: string;
      item_type: string;
      unit_label: string;
    }[];
  }>;
};

function compareDeliveryDates(a: string, b: string): number {
  return a.localeCompare(b);
}

function comparePlacedNewestFirst(a: GroupedCheckout, b: GroupedCheckout): number {
  return b.placedAt.localeCompare(a.placedAt);
}

export function isFullyCancelledGroup(orders: StaffProviderOrder[]): boolean {
  return orders.length > 0 && orders.every((order) => order.status === "cancelled");
}

export function calculateOrderGross(
  items: Array<{ quantity: number; unit_price: number }>,
): number {
  return items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
}

export function mapRawOrderToProviderOrder(
  order: StaffMyOrdersRawRow,
  indexInGroup: number,
  groupOrderCount: number,
): StaffProviderOrder {
  const lunchDay = getRelated(order.lunch_days);
  const provider = lunchDay ? getRelated(lunchDay.lunch_providers) : null;

  const lines: ProviderOrderLine[] = order.order_items.map((item) => {
    const menuItem = getRelated(item.menu_items);
    const unitPrice = Number(item.unit_price);
    return {
      name: menuItem?.name ?? "Menu item",
      quantity: item.quantity,
      itemType: (menuItem?.item_type ?? "standalone") as MenuItemType,
      unitLabel: menuItem?.unit_label ?? "Each",
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    };
  });

  const orderTotal = calculateOrderGross(order.order_items);

  return {
    id: order.id,
    providerId: provider?.id ?? "",
    providerName: provider?.name ?? "Lunch provider",
    indexInGroup,
    groupOrderCount,
    status: order.status,
    deliveryState: order.delivery_state as DeliveryState,
    financialDisposition: order.financial_disposition as FinancialDisposition,
    specialInstructions: order.special_instructions,
    mealQuantity: order.meal_quantity,
    lines,
    orderTotal,
    statusLabel: deriveProviderStatusLabel(order),
    createdAt: order.created_at,
  };
}

export function deriveProviderStatusLabel(order: {
  status: string;
  delivery_state: string;
}): string {
  if (order.status === "cancelled") {
    return "Cancelled";
  }

  if (order.status === "fulfilled" || order.delivery_state === "delivered") {
    return "Delivered";
  }

  if (order.delivery_state === "issue_open") {
    return "Delivery issue";
  }

  if (order.delivery_state === "resolved") {
    return "Resolved";
  }

  return "Submitted";
}

export function deriveCheckoutStatus(
  providerOrders: StaffProviderOrder[],
  deliveryDate: string,
  today: string,
): { label: string; kind: GroupedCheckout["checkoutStatusKind"] } {
  if (isFullyCancelledGroup(providerOrders)) {
    return { label: "Cancelled", kind: "cancelled" };
  }

  const active = providerOrders.filter((order) => order.status !== "cancelled");

  if (active.some((order) => order.deliveryState === "issue_open")) {
    return { label: "Delivery issue", kind: "issue" };
  }

  if (
    active.length > 0 &&
    active.every(
      (order) =>
        order.status === "fulfilled" || order.deliveryState === "delivered",
    )
  ) {
    return { label: "Delivered", kind: "delivered" };
  }

  if (compareDeliveryDates(deliveryDate, today) >= 0) {
    return { label: "Upcoming", kind: "upcoming" };
  }

  return { label: "Submitted", kind: "submitted" };
}

export function deriveCancellationSummary(
  providerOrders: StaffProviderOrder[],
  orderDeadline: string | null,
  cancelledAt: string | null,
): string | null {
  if (!isFullyCancelledGroup(providerOrders) || !cancelledAt) {
    return null;
  }

  if (orderDeadline && new Date(cancelledAt) <= new Date(orderDeadline)) {
    return "Cancelled before cutoff";
  }

  return "Cancelled";
}

export function groupOrdersIntoCheckouts(
  rows: StaffMyOrdersRawRow[],
  dailySubsidy: number,
  deliveredAtByOrderId: Map<string, string>,
): GroupedCheckout[] {
  const byGroup = new Map<string, StaffMyOrdersRawRow[]>();

  for (const row of rows) {
    if (!row.order_group_id) {
      continue;
    }

    const list = byGroup.get(row.order_group_id) ?? [];
    list.push(row);
    byGroup.set(row.order_group_id, list);
  }

  const draftGroups: Array<Omit<GroupedCheckout, "subtotal" | "lunchSubsidy" | "youPay" | "payLabel"> & {
    subtotal: number;
    orderDateKey: string | null;
    orderDeadline: string | null;
  }> = [];

  for (const [orderGroupId, orders] of byGroup.entries()) {
    const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lunchDay = getRelated(sorted[0]!.lunch_days);
    const deliveryDate = lunchDay?.lunch_date ?? "";
    const orderDate = lunchDay?.order_date ?? null;
    const orderDeadline = lunchDay?.order_deadline ?? null;
    const placedAt = sorted[0]!.created_at;
    const officeLocationName = sorted[0]!.office_location_name;

    const providerOrders = sorted.map((order, index) =>
      mapRawOrderToProviderOrder(order, index + 1, sorted.length),
    );

    const subtotal = providerOrders.reduce((sum, order) => sum + order.orderTotal, 0);
    const fullyCancelled = isFullyCancelledGroup(providerOrders);
    const cancelledAt = fullyCancelled
      ? sorted.reduce(
          (latest, order) =>
            latest.localeCompare(order.updated_at) >= 0 ? latest : order.updated_at,
          sorted[0]!.updated_at,
        )
      : null;

    const deliveredAt = providerOrders
      .map((order) => deliveredAtByOrderId.get(order.id))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

    const today = getJamaicaTodayDate();
    const checkoutStatus = deriveCheckoutStatus(providerOrders, deliveryDate, today);
    const providerCount = new Set(
      providerOrders.map((order) => order.providerId).filter(Boolean),
    ).size;

    draftGroups.push({
      orderGroupId,
      deliveryDate,
      orderDate,
      placedAt,
      officeLocationName,
      providerOrders,
      providerCount,
      orderCount: providerOrders.length,
      checkoutStatusLabel: checkoutStatus.label,
      checkoutStatusKind: checkoutStatus.kind,
      subtotal,
      orderDateKey: orderDate,
      orderDeadline,
      deliveredAt,
      cancelledAt,
      cancellationSummary: deriveCancellationSummary(
        providerOrders,
        orderDeadline,
        cancelledAt,
      ),
    });
  }

  const grossBeforeByOrderDate = new Map<string, number>();
  const chronological = [...draftGroups].sort((a, b) => a.placedAt.localeCompare(b.placedAt));

  const financialByGroupId = new Map<
    string,
    { lunchSubsidy: number; youPay: number }
  >();

  for (const group of chronological) {
    if (group.orderDateKey && !isFullyCancelledGroup(group.providerOrders)) {
      const priorGross = grossBeforeByOrderDate.get(group.orderDateKey) ?? 0;
      const financial = calculateMarginalOrderCheckout({
        dailySubsidy,
        existingOrderDateGross: priorGross,
        orderSubtotal: group.subtotal,
      });
      financialByGroupId.set(group.orderGroupId, {
        lunchSubsidy: financial.lunchSubsidy,
        youPay: financial.youPay,
      });
      grossBeforeByOrderDate.set(
        group.orderDateKey,
        priorGross + group.subtotal,
      );
    } else {
      financialByGroupId.set(group.orderGroupId, {
        lunchSubsidy: 0,
        youPay: 0,
      });
    }
  }

  return draftGroups
    .map((group) => {
      const financial = financialByGroupId.get(group.orderGroupId) ?? {
        lunchSubsidy: 0,
        youPay: 0,
      };

      return {
        orderGroupId: group.orderGroupId,
        deliveryDate: group.deliveryDate,
        orderDate: group.orderDate,
        placedAt: group.placedAt,
        officeLocationName: group.officeLocationName,
        providerOrders: group.providerOrders,
        providerCount: group.providerCount,
        orderCount: group.orderCount,
        checkoutStatusLabel: group.checkoutStatusLabel,
        checkoutStatusKind: group.checkoutStatusKind,
        subtotal: group.subtotal,
        lunchSubsidy: financial.lunchSubsidy,
        youPay: financial.youPay,
        payLabel:
          group.checkoutStatusKind === "delivered" ? ("You Paid" as const) : ("You Pay" as const),
        deliveredAt: group.deliveredAt,
        cancelledAt: group.cancelledAt,
        cancellationSummary: group.cancellationSummary,
      };
    })
    .sort(comparePlacedNewestFirst);
}

export function selectUpcomingCheckouts(groups: GroupedCheckout[]): GroupedCheckout[] {
  const today = getJamaicaTodayDate();

  return groups
    .filter((group) => {
      if (isFullyCancelledGroup(group.providerOrders)) {
        return false;
      }

      if (group.checkoutStatusKind === "delivered") {
        return false;
      }

      return compareDeliveryDates(group.deliveryDate, today) >= 0;
    })
    .sort((a, b) => compareDeliveryDates(a.deliveryDate, b.deliveryDate));
}

export function selectPastDeliveryDates(groups: GroupedCheckout[]): string[] {
  const today = getJamaicaTodayDate();
  const dates = new Set<string>();

  for (const group of groups) {
    if (isFullyCancelledGroup(group.providerOrders)) {
      continue;
    }

    if (
      group.checkoutStatusKind === "delivered" ||
      compareDeliveryDates(group.deliveryDate, today) < 0
    ) {
      dates.add(group.deliveryDate);
    }
  }

  return Array.from(dates).sort((a, b) => b.localeCompare(a));
}

const PAST_ORDER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePastOrderDateParam(
  value: string | undefined | null,
): string | null {
  if (!value || !PAST_ORDER_DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(`${value}T12:00:00-05:00`);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return value;
}

export function getMostRecentPastDeliveryDate(pastDates: string[]): string | null {
  return pastDates[0] ?? null;
}

export function selectPastCheckoutsForDate(
  groups: GroupedCheckout[],
  deliveryDate: string,
): GroupedCheckout[] {
  return groups
    .filter(
      (group) =>
        group.deliveryDate === deliveryDate &&
        !isFullyCancelledGroup(group.providerOrders),
    )
    .sort(comparePlacedNewestFirst);
}

/** @deprecated Use selectPastCheckoutsForDate — returns all groups for the date. */
export function selectPastCheckoutForDate(
  groups: GroupedCheckout[],
  deliveryDate: string,
): GroupedCheckout | null {
  return selectPastCheckoutsForDate(groups, deliveryDate)[0] ?? null;
}

export function selectCancelledCheckouts(
  groups: GroupedCheckout[],
  limit = 3,
): GroupedCheckout[] {
  return groups
    .filter((group) => isFullyCancelledGroup(group.providerOrders))
    .sort((a, b) => (b.cancelledAt ?? b.placedAt).localeCompare(a.cancelledAt ?? a.placedAt))
    .slice(0, limit);
}

export function parseMyOrdersTab(value: string | undefined): MyOrdersTab {
  if (value === "past" || value === "cancelled") {
    return value;
  }

  return "upcoming";
}

export function getMealAndStandaloneLines(lines: ProviderOrderLine[]): {
  mealMain: ProviderOrderLine | null;
  mealSides: ProviderOrderLine[];
  standalone: ProviderOrderLine[];
} {
  const grouped = groupMenuItemsByType(
    lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      itemType: line.itemType,
      unitLabel: line.unitLabel,
      unitPrice: line.unitPrice,
      displayCategory: null,
    })),
  );

  const mealMain = grouped.main[0]
    ? lines.find((line) => line.itemType === "main" && line.name === grouped.main[0]!.name) ?? null
    : null;

  const mealSides = lines.filter((line) => line.itemType === "side");
  const standalone = lines.filter((line) => line.itemType === "standalone");

  return { mealMain, mealSides, standalone };
}
