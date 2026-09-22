import { getOperationalDisplayState } from "@/lib/delivery-reconciliation";
import { formatLunchPeriodAdminDate } from "@/lib/lunch-periods";
import { formatOrderLineLabel } from "@/lib/menu-items";
import {
  buildOperationalOrderDetailGroups,
  type OperationalDeliveryReport,
  type OperationalOrder,
  type ProviderOperationalGroup,
} from "@/lib/operational-orders";

export const TODAYS_ORDERS_PAGE = {
  title: "Today's Orders",
  description:
    "Orders placed during today's normal ordering cycle (order date = today). Late orders from prior order dates appear in Late Orders and Order History.",
  emptyMessage: "No orders were placed during today's normal ordering cycle.",
} as const;

export type TodaysOrdersSummaryMetrics = {
  orderCount: number;
  providerCount: number;
  locationCount: number;
  pendingCount: number;
  issueCount: number;
};

export function buildTodaysOrdersSummaryMetrics(
  report: OperationalDeliveryReport,
): TodaysOrdersSummaryMetrics {
  const locations = new Set<string>();
  let pendingCount = 0;
  let issueCount = 0;

  for (const provider of report.providers) {
    for (const office of provider.offices) {
      locations.add(office.name);
      for (const order of office.orders) {
        if (order.status !== "cancelled" && order.deliveryState === "pending") {
          pendingCount += 1;
        }
        if (order.deliveryState === "issue_open") {
          issueCount += 1;
        }
      }
    }
  }

  return {
    orderCount: report.totalOrders,
    providerCount: report.providers.length,
    locationCount: locations.size,
    pendingCount,
    issueCount,
  };
}

export function formatProviderLocationSubtitle(
  officeSummaries: ProviderOperationalGroup["officeSummaries"],
): string {
  if (officeSummaries.length === 0) {
    return "No delivery location";
  }

  if (officeSummaries.length === 1) {
    const summary = officeSummaries[0];
    return `${summary.name} · ${summary.orderCount} order${summary.orderCount === 1 ? "" : "s"}`;
  }

  const orderTotal = officeSummaries.reduce((sum, summary) => sum + summary.orderCount, 0);
  return `${officeSummaries.length} locations · ${orderTotal} order${orderTotal === 1 ? "" : "s"}`;
}

export function countProviderEmployeeOrders(provider: ProviderOperationalGroup): number {
  return provider.offices.reduce((sum, office) => sum + office.orders.length, 0);
}

export function flattenProviderOrders(
  provider: ProviderOperationalGroup,
): Array<OperationalOrder & { officeName: string }> {
  return provider.offices.flatMap((office) =>
    office.orders.map((order) => ({ ...order, officeName: office.name })),
  );
}

export function providerHasMultipleLocations(
  provider: ProviderOperationalGroup,
): boolean {
  return provider.officeSummaries.length > 1;
}

export function formatTodaysOrderDisplayDate(date: string): string {
  return formatLunchPeriodAdminDate(date);
}

export function getTodaysOrderStatusLabel(order: OperationalOrder): string {
  return getOperationalDisplayState(order);
}

export function formatTodaysOrderDetailLines(order: OperationalOrder): string[] {
  const groups = buildOperationalOrderDetailGroups(order);
  const lines: string[] = [];

  const pushItems = (
    items: Array<{ name: string; quantity: number; unitLabel: string }>,
  ) => {
    for (const item of items) {
      lines.push(formatOrderLineLabel(item.name, item.unitLabel, item.quantity));
    }
  };

  if (groups.mealQuantity && groups.mains.length > 0) {
    pushItems([...groups.mains, ...groups.sides]);
  } else {
    pushItems([...groups.mains, ...groups.sides]);
    for (const items of Object.values(groups.standaloneByCategory)) {
      pushItems(items);
    }
  }

  return lines;
}

/** Scheduled delivery date (`lunch_days.lunch_date`) for provider print sheet query param. */
export function resolveProviderPrintDeliveryDate(provider: ProviderOperationalGroup): string {
  for (const office of provider.offices) {
    for (const order of office.orders) {
      if (order.deliveryDate) {
        return order.deliveryDate;
      }
    }
  }

  throw new Error("Provider group has no orders with a delivery date");
}

export function buildProviderPrintHref(providerId: string, deliveryDate: string): string {
  return `/admin/deliveries/provider/${providerId}/print?deliveryDate=${deliveryDate}`;
}
