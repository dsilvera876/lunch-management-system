import { getRelated } from "@/lib/format";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  groupMenuItemsByType,
  type MenuItemType,
} from "@/lib/menu-items";
import type { DeliveryState, FinancialDisposition } from "@/lib/delivery-reconciliation";
import { calculateMarginalOrderCheckout } from "@/lib/order-subsidy-preview";
import { MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB } from "@/lib/staff-late-order-submissions";

export type MyOrdersTab = "upcoming" | "past" | "cancelled" | typeof MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB;

export type ProviderOrderLine = {
  name: string;
  quantity: number;
  itemType: MenuItemType;
  unitLabel: string;
  unitPrice: number;
  lineTotal: number;
  providerMenuItemId: string | null;
};

export type StaffProviderOrder = {
  id: string;
  providerId: string;
  providerName: string;
  ratingsEnabled: boolean;
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
  isLateOrder: boolean;
  canEdit: boolean;
  canCancel: boolean;
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
  originalSubtotal: number;
  chargeableSubtotal: number;
  lunchSubsidy: number;
  youPay: number;
  payLabel: "You Pay" | "Your cost" | "No amount due";
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationSummary: string | null;
};

export type StaffMyOrdersRawRow = {
  id: string;
  lunch_day_id: string;
  order_group_id: string | null;
  is_late_order: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  delivery_state: string;
  financial_disposition: string;
  special_instructions: string | null;
  meal_quantity: number | null;
  office_location_id: string | null;
  office_location_name: string | null;
  lunch_days: {
    status: string;
    lunch_date: string;
    order_date: string;
    order_deadline: string;
    lunch_providers:
      | { id: string; name: string; ratings_enabled: boolean | null; active: boolean }
      | { id: string; name: string; ratings_enabled: boolean | null; active: boolean }[];
  } | {
    status: string;
    lunch_date: string;
    order_date: string;
    order_deadline: string;
    lunch_providers:
      | { id: string; name: string; ratings_enabled: boolean | null; active: boolean }
      | { id: string; name: string; ratings_enabled: boolean | null; active: boolean }[];
  }[];
  order_items: Array<{
    quantity: number;
    unit_price: number;
    menu_items: {
      name: string;
      item_type: string;
      unit_label: string;
      provider_menu_item_id: string | null;
    } | {
      name: string;
      item_type: string;
      unit_label: string;
      provider_menu_item_id: string | null;
    }[];
  }>;
};

export type StaffMyOrdersSnapshotRow = StaffMyOrdersRawRow & {
  delivered_at: string | null;
  effective_order_deadline: string | null;
  ordering_state: {
    is_open: boolean;
    is_business_day: boolean;
    period_finalized: boolean;
  } | null;
};

export type StaffMyOrdersSnapshot = {
  snapshotAt: string;
  jamaicaToday: string;
  rows: StaffMyOrdersSnapshotRow[];
  dailySubsidyByOrderDate: Map<string, number>;
};

export type StaffOrderCapabilities = {
  canEdit: boolean;
  canCancel: boolean;
};

export type SelfServiceOrderingState = {
  isOpen: boolean;
  isBusinessDay: boolean;
  periodFinalized: boolean;
};

export type StaffMyOrdersLunchPeriod = {
  start_date: string;
  end_date: string;
  status: "open" | "finalized";
  finalized_daily_subsidy: string | number | null;
};

export type DailySubsidyByOrderDate = ReadonlyMap<string, number>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasValidProvider(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.ratings_enabled === "boolean" &&
    typeof value.active === "boolean";
}

function hasValidLunchDay(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.status === "string" &&
    typeof value.lunch_date === "string" &&
    isValidIsoDate(value.lunch_date) &&
    typeof value.order_date === "string" &&
    isValidIsoDate(value.order_date) &&
    typeof value.order_deadline === "string" &&
    Number.isFinite(Date.parse(value.order_deadline)) &&
    hasValidProvider(value.lunch_providers);
}

function hasValidOrderItem(value: unknown): boolean {
  if (!isRecord(value) ||
      !Number.isSafeInteger(value.quantity) ||
      Number(value.quantity) <= 0 ||
      typeof value.unit_price !== "number" ||
      !Number.isFinite(value.unit_price) ||
      value.unit_price < 0 ||
      !isRecord(value.menu_items)) {
    return false;
  }

  const menuItem = value.menu_items;
  return typeof menuItem.name === "string" &&
    typeof menuItem.item_type === "string" &&
    typeof menuItem.unit_label === "string" &&
    isNullableString(menuItem.provider_menu_item_id);
}

function hasValidOrderingState(value: unknown): boolean {
  return value === null || (
    isRecord(value) &&
    typeof value.is_open === "boolean" &&
    typeof value.is_business_day === "boolean" &&
    typeof value.period_finalized === "boolean"
  );
}

function hasValidSnapshotOrder(value: unknown): value is StaffMyOrdersSnapshotRow {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string" &&
    typeof value.lunch_day_id === "string" &&
    isNullableString(value.order_group_id) &&
    typeof value.is_late_order === "boolean" &&
    typeof value.status === "string" &&
    typeof value.created_at === "string" &&
    Number.isFinite(Date.parse(value.created_at)) &&
    typeof value.updated_at === "string" &&
    Number.isFinite(Date.parse(value.updated_at)) &&
    typeof value.delivery_state === "string" &&
    typeof value.financial_disposition === "string" &&
    isNullableString(value.special_instructions) &&
    (value.meal_quantity === null || Number.isSafeInteger(value.meal_quantity)) &&
    isNullableString(value.office_location_id) &&
    isNullableString(value.office_location_name) &&
    hasValidLunchDay(value.lunch_days) &&
    Array.isArray(value.order_items) &&
    value.order_items.length > 0 &&
    value.order_items.every(hasValidOrderItem) &&
    isNullableString(value.delivered_at) &&
    (value.delivered_at === null || Number.isFinite(Date.parse(value.delivered_at))) &&
    isNullableString(value.effective_order_deadline) &&
    (value.effective_order_deadline === null ||
      Number.isFinite(Date.parse(value.effective_order_deadline))) &&
    hasValidOrderingState(value.ordering_state);
}

export function parseStaffMyOrdersSnapshot(data: unknown): StaffMyOrdersSnapshot {
  if (!isRecord(data) ||
      data.snapshot_version !== 1 ||
      data.financial_context_valid !== true ||
      typeof data.snapshot_at !== "string" ||
      !Number.isFinite(Date.parse(data.snapshot_at)) ||
      typeof data.jamaica_today !== "string" ||
      !isValidIsoDate(data.jamaica_today) ||
      !Array.isArray(data.orders) ||
      !data.orders.every(hasValidSnapshotOrder) ||
      !Array.isArray(data.daily_subsidies)) {
    throw new Error("Unable to load your order totals.");
  }

  const dailySubsidyByOrderDate = new Map<string, number>();
  for (const value of data.daily_subsidies) {
    if (!isRecord(value) ||
        typeof value.order_date !== "string" ||
        !isValidIsoDate(value.order_date) ||
        typeof value.effective_daily_subsidy !== "number" ||
        !Number.isFinite(value.effective_daily_subsidy) ||
        value.effective_daily_subsidy < 0 ||
        dailySubsidyByOrderDate.has(value.order_date)) {
      throw new Error("Unable to load your order totals.");
    }
    dailySubsidyByOrderDate.set(value.order_date, value.effective_daily_subsidy);
  }

  const rows = data.orders as StaffMyOrdersSnapshotRow[];
  const orderIds = new Set<string>();
  for (const row of rows) {
    if (orderIds.has(row.id)) {
      throw new Error("Unable to load your order totals.");
    }
    orderIds.add(row.id);
  }
  if (rows.some((row) => {
    const lunchDay = row.lunch_days as Exclude<StaffMyOrdersRawRow["lunch_days"], unknown[]>;
    return !dailySubsidyByOrderDate.has(lunchDay.order_date);
  })) {
    throw new Error("Unable to load your order totals.");
  }

  return {
    snapshotAt: data.snapshot_at,
    jamaicaToday: data.jamaica_today,
    rows,
    dailySubsidyByOrderDate,
  };
}

function parseNonNegativeMoney(value: unknown): number | null {
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Mirrors private.effective_daily_lunch_subsidy without exposing private RPCs:
 * finalized periods use their immutable snapshot; all other dates use the
 * current setting. Ambiguous or malformed financial context fails closed.
 */
export function resolveDailySubsidyByOrderDate(params: {
  orderDates: Iterable<string>;
  currentDailySubsidy: unknown;
  lunchPeriods: StaffMyOrdersLunchPeriod[];
}): Map<string, number> {
  const currentDailySubsidy = parseNonNegativeMoney(params.currentDailySubsidy);
  if (currentDailySubsidy === null) {
    throw new Error("Unable to load your order totals.");
  }

  for (const period of params.lunchPeriods) {
    if (
      !isValidIsoDate(period.start_date) ||
      !isValidIsoDate(period.end_date) ||
      period.start_date > period.end_date ||
      (period.status !== "open" && period.status !== "finalized")
    ) {
      throw new Error("Unable to load your order totals.");
    }
  }

  const result = new Map<string, number>();
  for (const orderDate of new Set(params.orderDates)) {
    if (!isValidIsoDate(orderDate)) {
      throw new Error("Unable to load your order totals.");
    }

    const matchingPeriods = params.lunchPeriods.filter(
      (period) => orderDate >= period.start_date && orderDate <= period.end_date,
    );
    if (matchingPeriods.length > 1) {
      throw new Error("Unable to load your order totals.");
    }

    const period = matchingPeriods[0];
    if (period?.status === "finalized") {
      const finalizedSubsidy = parseNonNegativeMoney(period.finalized_daily_subsidy);
      if (finalizedSubsidy === null) {
        throw new Error("Unable to load your order totals.");
      }
      result.set(orderDate, finalizedSubsidy);
    } else {
      result.set(orderDate, currentDailySubsidy);
    }
  }

  return result;
}

export function isFinanciallyChargeableOrder(order: Pick<
  StaffProviderOrder,
  "status" | "financialDisposition"
>): boolean {
  return (
    (order.status === "submitted" || order.status === "fulfilled") &&
    order.financialDisposition === "chargeable"
  );
}

export function getOrderFinancialStatusLabel(order: Pick<
  StaffProviderOrder,
  "status" | "financialDisposition"
>): string | null {
  if (isFinanciallyChargeableOrder(order)) {
    return null;
  }
  if (order.status === "cancelled") {
    return "Cancelled — not charged";
  }
  if (order.financialDisposition === "on_hold") {
    return "On hold — not currently charged";
  }
  if (order.financialDisposition === "waived") {
    return "Waived — not charged";
  }
  return "Not charged";
}

export function deriveStaffOrderCapabilities(params: {
  order: StaffMyOrdersRawRow;
  effectiveDeadline: string | null;
  orderingState: SelfServiceOrderingState | null;
  today: string;
  nowMs: number;
}): StaffOrderCapabilities {
  const { order, effectiveDeadline, orderingState, today, nowMs } = params;
  const lunchDay = getRelated(order.lunch_days);
  const provider = lunchDay ? getRelated(lunchDay.lunch_providers) : null;
  const deadlineTime = effectiveDeadline ? new Date(effectiveDeadline).getTime() : Number.NaN;

  const canCancel = Boolean(
    lunchDay &&
      provider?.active === true &&
      order.status === "submitted" &&
      !order.is_late_order &&
      lunchDay.status === "open" &&
      lunchDay.lunch_date >= today &&
      orderingState &&
      !orderingState.periodFinalized &&
      Number.isFinite(deadlineTime) &&
      nowMs <= deadlineTime,
  );

  return {
    canCancel,
    canEdit:
      canCancel &&
      orderingState?.isBusinessDay === true &&
      orderingState.isOpen === true,
  };
}

function compareDeliveryDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Self-service checkouts use order_group_id; legacy HR late orders may omit it until backfilled. */
export function resolveStaffMyOrdersCheckoutGroupKey(row: StaffMyOrdersRawRow): string {
  return row.order_group_id ?? row.id;
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
  return items.reduce((sum, item) => {
    const unitPrice = Number(item.unit_price);
    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error("Unable to load your order totals.");
    }
    return sum + unitPrice * item.quantity;
  }, 0);
}

export function mapRawOrderToProviderOrder(
  order: StaffMyOrdersRawRow,
  indexInGroup: number,
  groupOrderCount: number,
  capabilities: StaffOrderCapabilities = { canEdit: false, canCancel: false },
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
      providerMenuItemId: menuItem?.provider_menu_item_id ?? null,
    };
  });

  const orderTotal = calculateOrderGross(order.order_items);

  return {
    id: order.id,
    providerId: provider?.id ?? "",
    providerName: provider?.name ?? "Lunch provider",
    ratingsEnabled: provider?.ratings_enabled === true,
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
    isLateOrder: Boolean(order.is_late_order),
    canEdit: capabilities.canEdit && !order.is_late_order && order.status === "submitted",
    canCancel: capabilities.canCancel && !order.is_late_order && order.status === "submitted",
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
  dailySubsidy: number | DailySubsidyByOrderDate,
  deliveredAtByOrderId: Map<string, string>,
  capabilitiesByOrderId: ReadonlyMap<string, StaffOrderCapabilities> = new Map(),
): GroupedCheckout[] {
  const byGroup = new Map<string, StaffMyOrdersRawRow[]>();

  for (const row of rows) {
    const groupKey = resolveStaffMyOrdersCheckoutGroupKey(row);
    const list = byGroup.get(groupKey) ?? [];
    list.push(row);
    byGroup.set(groupKey, list);
  }

  const draftGroups: Array<Omit<GroupedCheckout, "lunchSubsidy" | "youPay" | "payLabel"> & {
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

    if (
      !lunchDay ||
      !isValidIsoDate(deliveryDate) ||
      !orderDate ||
      !isValidIsoDate(orderDate) ||
      sorted.some((order) => {
        const candidateDay = getRelated(order.lunch_days);
        return (
          candidateDay?.lunch_date !== deliveryDate ||
          candidateDay.order_date !== orderDate
        );
      })
    ) {
      throw new Error("Unable to load your order totals.");
    }

    const providerOrders = sorted.map((order, index) =>
      mapRawOrderToProviderOrder(
        order,
        index + 1,
        sorted.length,
        capabilitiesByOrderId.get(order.id),
      ),
    );

    const originalSubtotal = providerOrders.reduce((sum, order) => sum + order.orderTotal, 0);
    const chargeableSubtotal = providerOrders
      .filter(isFinanciallyChargeableOrder)
      .reduce((sum, order) => sum + order.orderTotal, 0);
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
      originalSubtotal,
      chargeableSubtotal,
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
  const chronological = [...draftGroups].sort(
    (a, b) =>
      a.placedAt.localeCompare(b.placedAt) ||
      a.orderGroupId.localeCompare(b.orderGroupId),
  );

  const financialByGroupId = new Map<
    string,
    { lunchSubsidy: number; youPay: number }
  >();

  for (const group of chronological) {
    if (group.chargeableSubtotal > 0) {
      if (!group.orderDateKey) {
        throw new Error("Unable to load your order totals.");
      }
      const effectiveDailySubsidy =
        typeof dailySubsidy === "number"
          ? dailySubsidy
          : dailySubsidy.get(group.orderDateKey);
      if (
        effectiveDailySubsidy === undefined ||
        !Number.isFinite(effectiveDailySubsidy) ||
        effectiveDailySubsidy < 0
      ) {
        throw new Error("Unable to load your order totals.");
      }
      const priorGross = grossBeforeByOrderDate.get(group.orderDateKey) ?? 0;
      const financial = calculateMarginalOrderCheckout({
        dailySubsidy: effectiveDailySubsidy,
        existingOrderDateGross: priorGross,
        orderSubtotal: group.chargeableSubtotal,
      });
      financialByGroupId.set(group.orderGroupId, {
        lunchSubsidy: financial.lunchSubsidy,
        youPay: financial.youPay,
      });
      grossBeforeByOrderDate.set(
        group.orderDateKey,
        priorGross + group.chargeableSubtotal,
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
        originalSubtotal: group.originalSubtotal,
        chargeableSubtotal: group.chargeableSubtotal,
        lunchSubsidy: financial.lunchSubsidy,
        youPay: financial.youPay,
        payLabel:
          financial.youPay <= 0
            ? ("No amount due" as const)
            : compareDeliveryDates(group.deliveryDate, getJamaicaTodayDate()) >= 0
              ? ("You Pay" as const)
              : ("Your cost" as const),
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

  if (value === MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB) {
    return MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB;
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
