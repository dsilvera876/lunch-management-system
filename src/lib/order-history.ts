import { formatHumanDate } from "@/lib/format";
import { JAMAICA_TIME_ZONE } from "@/lib/datetime";
import {
  matchesReconciliationFilter,
  RECONCILIATION_FILTERS,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import { buildDeliveryRowDisplay } from "@/lib/deliveries";
import {
  buildOperationalDeliveryReport,
  groupOperationalOrdersByProvider,
  type OperationalOrder,
} from "@/lib/operational-orders";

export const ORDER_HISTORY_ALL_DATES = "all";

export const EMPLOYEE_RECENT_ORDER_HISTORY_LIMIT = 5;

export const ORDER_HISTORY_ALL_DATES_LABEL = "All dates";

export type OrderHistoryFilters = {
  deliveryDate: string;
  providerId: string;
  officeLocation: string;
  reconciliationStatus: ReconciliationFilter;
  employeeId: string;
};

export function parseOrderHistoryFilters(input: {
  deliveryDate?: string;
  provider?: string;
  location?: string;
  reconciliation?: string;
  employee?: string;
  defaultDeliveryDate: string;
}): OrderHistoryFilters {
  const reconciliationStatus = RECONCILIATION_FILTERS.includes(
    input.reconciliation as ReconciliationFilter,
  )
    ? (input.reconciliation as ReconciliationFilter)
    : "all";

  const deliveryDateRaw = input.deliveryDate?.trim();
  const deliveryDate =
    deliveryDateRaw === ORDER_HISTORY_ALL_DATES
      ? ORDER_HISTORY_ALL_DATES
      : deliveryDateRaw || input.defaultDeliveryDate;

  return {
    deliveryDate,
    providerId: input.provider?.trim() ?? "",
    officeLocation: input.location?.trim() ?? "",
    reconciliationStatus,
    employeeId: input.employee?.trim() ?? "",
  };
}

export function buildOrderHistoryUrl(filters: OrderHistoryFilters): string {
  const query = new URLSearchParams();

  if (filters.deliveryDate !== ORDER_HISTORY_ALL_DATES) {
    query.set("deliveryDate", filters.deliveryDate);
  } else {
    query.set("deliveryDate", ORDER_HISTORY_ALL_DATES);
  }

  if (filters.providerId) {
    query.set("provider", filters.providerId);
  }

  if (filters.officeLocation) {
    query.set("location", filters.officeLocation);
  }

  if (filters.reconciliationStatus !== "all") {
    query.set("reconciliation", filters.reconciliationStatus);
  }

  if (filters.employeeId) {
    query.set("employee", filters.employeeId);
  }

  const serialized = query.toString();
  return serialized ? `/admin/orders?${serialized}` : "/admin/orders";
}

export function isEmployeeHistoryMode(filters: OrderHistoryFilters): boolean {
  return Boolean(filters.employeeId) && filters.deliveryDate === ORDER_HISTORY_ALL_DATES;
}

export function shouldShowEmployeeHistoryTable(filters: OrderHistoryFilters): boolean {
  return isEmployeeHistoryMode(filters);
}

export function shouldShowProviderGroupedResults(filters: OrderHistoryFilters): boolean {
  if (filters.deliveryDate !== ORDER_HISTORY_ALL_DATES) {
    return true;
  }

  return !filters.employeeId;
}

export function compareOrdersNewestFirst(a: OperationalOrder, b: OperationalOrder): number {
  const dateCompare = b.deliveryDate.localeCompare(a.deliveryDate);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return b.createdAt.localeCompare(a.createdAt);
}

export function sortOrdersForEmployeeHistory(orders: OperationalOrder[]): OperationalOrder[] {
  return [...orders].sort(compareOrdersNewestFirst);
}

export function filterOrdersForHistoryView(
  orders: OperationalOrder[],
  reconciliationStatus: ReconciliationFilter,
): OperationalOrder[] {
  return orders.filter((order) =>
    matchesReconciliationFilter(reconciliationStatus, order),
  );
}

export function buildOrderHistoryReport(
  orders: OperationalOrder[],
  deliveryDate: string,
) {
  return buildOperationalDeliveryReport(orders, deliveryDate);
}

export function resolveProviderPrintDeliveryDate(
  providerOrders: OperationalOrder[],
  filters: OrderHistoryFilters,
  fallbackDeliveryDate: string,
): string {
  if (filters.deliveryDate !== ORDER_HISTORY_ALL_DATES) {
    return filters.deliveryDate;
  }

  const sorted = sortOrdersForEmployeeHistory(providerOrders);
  return sorted[0]?.deliveryDate ?? fallbackDeliveryDate;
}

export type OrderHistorySummaryInput = {
  filters: OrderHistoryFilters;
  orders: OperationalOrder[];
  employeeName?: string | null;
};

export function formatOrderHistorySummaryLine(input: OrderHistorySummaryInput): string {
  const { filters, orders, employeeName } = input;
  const providerIds = new Set(orders.map((order) => order.providerId));
  const offices = new Set(orders.map((order) => order.officeLocationName));

  const parts: string[] = [];

  if (filters.deliveryDate !== ORDER_HISTORY_ALL_DATES) {
    parts.push(formatHumanDate(filters.deliveryDate));
  }

  parts.push(`${orders.length} ${orders.length === 1 ? "order" : "orders"}`);

  if (filters.employeeId && employeeName) {
    parts.push(`1 employee (${employeeName})`);
  } else if (filters.employeeId) {
    parts.push("1 employee");
  }

  parts.push(`${providerIds.size} ${providerIds.size === 1 ? "provider" : "providers"}`);
  parts.push(`${offices.size} ${offices.size === 1 ? "office" : "offices"}`);

  return parts.join(" · ");
}

export function formatOrderHistoryTableQuantity(order: OperationalOrder): string {
  if (order.mealQuantity && order.mealQuantity > 0) {
    return String(order.mealQuantity);
  }

  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return total > 0 ? String(total) : "—";
}

export function formatOrderHistoryCompactOrderLines(order: OperationalOrder): string[] {
  const display = buildDeliveryRowDisplay(order);
  if (display.displayMode === "inline" && display.summaryText) {
    return [display.summaryText];
  }

  return display.summaryLines.length > 0 ? display.summaryLines : ["Order"];
}

export function groupProvidersForOrderHistory(orders: OperationalOrder[]) {
  return groupOperationalOrdersByProvider(orders);
}

export function formatOrderHistoryTimelineDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00-05:00`);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatOrderHistoryTimelineProviderOffice(
  providerName: string,
  officeLocationName: string | null | undefined,
) {
  const office = officeLocationName?.trim();
  return office ? `${providerName} · ${office}` : providerName;
}
