import {
  getOperationalDisplayState,
  matchesReconciliationFilter,
  RECONCILIATION_FILTERS,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import {
  buildOperationalOrderDetailGroups,
  type OperationalOrder,
  type OperationalOrderItem,
} from "@/lib/operational-orders";

export type DeliveryRowDisplay = {
  summaryText: string | null;
  summaryLines: string[];
  quantityLines: string[];
  displayMode: "inline" | "stacked";
};

export type OfficeDeliveryGroup = {
  name: string;
  orders: OperationalOrder[];
  progress: DeliveryProgress;
};

export type DeliveryProgress = {
  total: number;
  reconciled: number;
};

export type DeliveryPrintRow = {
  employeeName: string;
  orderLines: string[];
  quantityLines: string[];
  notesHint: string | null;
  deliveryState: string;
};

export type DeliveryPrintProviderSection = {
  name: string;
  rows: DeliveryPrintRow[];
};

export type DeliveryPrintOfficeSection = {
  name: string;
  providers: DeliveryPrintProviderSection[];
};

export type DeliveryPrintDocument = {
  providerName: string | null;
  deliveryDate: string;
  offices: DeliveryPrintOfficeSection[];
};

/**
 * Progress counts non-cancelled orders only.
 * Reconciled: delivery_state is delivered or resolved.
 * Unreconciled: pending or issue_open.
 * Cancelled orders are excluded from total and reconciled counts.
 */
export function isDeliveryReconciled(
  order: Pick<OperationalOrder, "status" | "deliveryState">,
): boolean {
  if (order.status === "cancelled") {
    return false;
  }

  return order.deliveryState === "delivered" || order.deliveryState === "resolved";
}

export function computeDeliveryProgress(
  orders: OperationalOrder[],
): DeliveryProgress {
  const qualifyingOrders = orders.filter((order) => order.status !== "cancelled");
  const total = qualifyingOrders.length;
  const reconciled = qualifyingOrders.filter(isDeliveryReconciled).length;

  return { total, reconciled };
}

export function groupOrdersByOfficeLocation(
  orders: OperationalOrder[],
): OfficeDeliveryGroup[] {
  const byOffice = new Map<string, OperationalOrder[]>();

  for (const order of orders) {
    const name = order.officeLocationName || "No delivery location";
    const bucket = byOffice.get(name) ?? [];
    bucket.push(order);
    byOffice.set(name, bucket);
  }

  return Array.from(byOffice.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, officeOrders]) => {
      const sorted = [...officeOrders].sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName),
      );

      return {
        name,
        orders: sorted,
        progress: computeDeliveryProgress(sorted),
      };
    });
}

function collectDisplayItems(order: OperationalOrder): OperationalOrderItem[] {
  const groups = buildOperationalOrderDetailGroups(order);
  const standalone = Object.values(groups.standaloneByCategory).flat();
  return [...groups.mains, ...groups.sides, ...standalone];
}

export function buildDeliveryRowDisplay(order: OperationalOrder): DeliveryRowDisplay {
  const groups = buildOperationalOrderDetailGroups(order);

  if (groups.mealQuantity && (groups.mains.length > 0 || groups.sides.length > 0)) {
    const parts = [...groups.mains, ...groups.sides].map((item) => item.name);

    return {
      summaryText: parts.join(" + "),
      summaryLines: [],
      quantityLines: [String(groups.mealQuantity)],
      displayMode: "inline",
    };
  }

  const items = collectDisplayItems(order);

  if (items.length === 1) {
    return {
      summaryText: items[0].name,
      summaryLines: [],
      quantityLines: [String(items[0].quantity)],
      displayMode: "inline",
    };
  }

  if (items.length === 0) {
    return {
      summaryText: "No items",
      summaryLines: [],
      quantityLines: ["—"],
      displayMode: "inline",
    };
  }

  return {
    summaryText: null,
    summaryLines: items.map((item) => item.name),
    quantityLines: items.map((item) => String(item.quantity)),
    displayMode: "stacked",
  };
}

export function getDeliveryDisplayLinePairs(order: OperationalOrder): {
  orderLines: string[];
  quantityLines: string[];
} {
  const display = buildDeliveryRowDisplay(order);

  if (display.displayMode === "inline" && display.summaryText) {
    return {
      orderLines: [display.summaryText],
      quantityLines: display.quantityLines,
    };
  }

  if (display.summaryLines.length === 0) {
    return {
      orderLines: [display.summaryText ?? "No items"],
      quantityLines: display.quantityLines.length > 0 ? display.quantityLines : ["—"],
    };
  }

  return {
    orderLines: display.summaryLines,
    quantityLines: display.quantityLines,
  };
}

export function formatDeliveryPrintOrderLines(order: OperationalOrder): {
  orderLines: string[];
  quantityLines: string[];
} {
  return getDeliveryDisplayLinePairs(order);
}

export function formatMobileOrderLines(order: OperationalOrder): string[] {
  const display = buildDeliveryRowDisplay(order);

  if (display.displayMode === "inline" && display.summaryText) {
    const qty = display.quantityLines[0];
    return [qty ? `${display.summaryText} ×${qty}` : display.summaryText];
  }

  if (display.summaryLines.length === 0) {
    return [display.summaryText ?? "No items"];
  }

  return display.summaryLines.map((line, index) => {
    const qty = display.quantityLines[index];
    return qty ? `${line} ×${qty}` : line;
  });
}

export type DeliveriesFilterState = {
  deliveryDate: string;
  providerId: string;
  officeLocation: string;
  reconciliationStatus: ReconciliationFilter;
};

export function resolveInitialReconciliationFilter(
  statusParam: string | undefined,
): ReconciliationFilter {
  if (
    statusParam &&
    RECONCILIATION_FILTERS.includes(statusParam as ReconciliationFilter)
  ) {
    return statusParam as ReconciliationFilter;
  }

  return "pending";
}

export function buildInitialDeliveriesFilters(input: {
  deliveryDate: string;
  providerId?: string;
  officeLocation?: string;
  statusParam?: string;
}): DeliveriesFilterState {
  return {
    deliveryDate: input.deliveryDate,
    providerId: input.providerId?.trim() ?? "",
    officeLocation: input.officeLocation?.trim() ?? "",
    reconciliationStatus: resolveInitialReconciliationFilter(input.statusParam),
  };
}

export function sanitizeDeliveriesFiltersAfterDateChange(
  filters: DeliveriesFilterState,
  orders: OperationalOrder[],
): DeliveriesFilterState {
  let providerId = filters.providerId;
  let officeLocation = filters.officeLocation;

  if (providerId && !orders.some((order) => order.providerId === providerId)) {
    providerId = "";
  }

  if (
    officeLocation &&
    !orders.some(
      (order) => (order.officeLocationName || "No delivery location") === officeLocation,
    )
  ) {
    officeLocation = "";
  }

  return {
    ...filters,
    providerId,
    officeLocation,
  };
}

export function applyDeliveriesToolbarFilters(
  orders: OperationalOrder[],
  filters: Pick<DeliveriesFilterState, "providerId" | "officeLocation">,
): OperationalOrder[] {
  let filtered = orders;

  if (filters.providerId) {
    filtered = filtered.filter((order) => order.providerId === filters.providerId);
  }

  if (filters.officeLocation) {
    filtered = filtered.filter(
      (order) =>
        (order.officeLocationName || "No delivery location") === filters.officeLocation,
    );
  }

  return filtered;
}

export function applyDeliveriesFilters(
  orders: OperationalOrder[],
  filters: Pick<
    DeliveriesFilterState,
    "providerId" | "officeLocation" | "reconciliationStatus"
  >,
): OperationalOrder[] {
  return filterDeliveriesOrders(
    applyDeliveriesToolbarFilters(orders, filters),
    filters.reconciliationStatus,
  );
}

export type DeliveryOrderDescription = {
  primaryLine: string;
  detailLine: string | null;
  quantityLabel: string;
};

export function formatDeliveryOrderDescription(
  order: OperationalOrder,
): DeliveryOrderDescription {
  const groups = buildOperationalOrderDetailGroups(order);

  if (groups.mealQuantity && groups.mains.length > 0) {
    const primaryLine = groups.mains[0]?.name ?? "Meal";
    const detailLine =
      groups.sides.length > 0
        ? groups.sides.map((side) => side.name).join(" · ")
        : null;

    return {
      primaryLine,
      detailLine,
      quantityLabel: String(groups.mealQuantity),
    };
  }

  const display = buildDeliveryRowDisplay(order);

  if (display.displayMode === "inline" && display.summaryText) {
    return {
      primaryLine: display.summaryText,
      detailLine: null,
      quantityLabel: display.quantityLines[0] ?? "—",
    };
  }

  if (display.summaryLines.length <= 1) {
    return {
      primaryLine: display.summaryLines[0] ?? display.summaryText ?? "No items",
      detailLine: null,
      quantityLabel: display.quantityLines[0] ?? "—",
    };
  }

  return {
    primaryLine: display.summaryLines[0] ?? "Order",
    detailLine: display.summaryLines.slice(1).join(" · "),
    quantityLabel: display.quantityLines[0] ?? "—",
  };
}

export function buildDeliveriesUrl(filters: DeliveriesFilterState): string {
  const params = new URLSearchParams();
  params.set("deliveryDate", filters.deliveryDate);

  if (filters.providerId) {
    params.set("provider", filters.providerId);
  }

  if (filters.officeLocation) {
    params.set("location", filters.officeLocation);
  }

  if (filters.reconciliationStatus !== "pending") {
    params.set("status", filters.reconciliationStatus);
  }

  return `/admin/deliveries?${params.toString()}`;
}

/** Sync filter query params without triggering Next.js navigation. */
export function replaceDeliveriesUrlInHistory(filters: DeliveriesFilterState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(window.history.state, "", buildDeliveriesUrl(filters));
}

export function buildDeliveryPrintDocument(
  orders: OperationalOrder[],
  deliveryDate: string,
  providerName: string | null,
): DeliveryPrintDocument {
  const offices = groupOrdersByOfficeLocation(orders).map((office) => {
    if (providerName) {
      return {
        name: office.name,
        providers: [
          {
            name: providerName,
            rows: office.orders.map((order) => toDeliveryPrintRow(order)),
          },
        ],
      };
    }

    const byProvider = new Map<string, OperationalOrder[]>();

    for (const order of office.orders) {
      const bucket = byProvider.get(order.providerName) ?? [];
      bucket.push(order);
      byProvider.set(order.providerName, bucket);
    }

    const providers = Array.from(byProvider.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, providerOrders]) => ({
        name,
        rows: [...providerOrders]
          .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
          .map((order) => toDeliveryPrintRow(order)),
      }));

    return {
      name: office.name,
      providers,
    };
  });

  return {
    providerName,
    deliveryDate,
    offices,
  };
}

function toDeliveryPrintRow(order: OperationalOrder): DeliveryPrintRow {
  const { orderLines, quantityLines } = formatDeliveryPrintOrderLines(order);

  return {
    employeeName: order.employeeName,
    orderLines,
    quantityLines,
    notesHint: order.specialInstructions?.trim() || null,
    deliveryState: getOperationalDisplayState(order),
  };
}

const FORBIDDEN_DELIVERY_PAYLOAD_KEYS = [
  "email",
  "role",
  "subsidy",
  "payroll",
  "net_deduction",
  "unit_price",
  "profile_id",
  "hr_delivery_notes",
  "financial_disposition",
] as const;

export function assertDeliveriesPayloadSafe(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const json = JSON.stringify(payload).toLowerCase();

  for (const key of FORBIDDEN_DELIVERY_PAYLOAD_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Deliveries payload must not include ${key}`);
    }
  }
}

export function filterDeliveriesOrders(
  orders: OperationalOrder[],
  filter: ReconciliationFilter,
): OperationalOrder[] {
  return orders.filter((order) => matchesReconciliationFilter(filter, order));
}

export type DeliveryOrderPatch = Partial<OperationalOrder> & { id: string };

export function patchDeliveryOrder(
  orders: OperationalOrder[],
  patch: DeliveryOrderPatch,
): OperationalOrder[] {
  return orders.map((order) =>
    order.id === patch.id ? { ...order, ...patch } : order,
  );
}

export function patchFromDelivered(
  order: OperationalOrder,
  actualDeliveryDate: string,
): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryState: "delivered",
    financialDisposition: "chargeable",
    status: "fulfilled",
    actualDeliveryDate,
    deliveryIssueType: null,
    deliveryResolutionType: null,
  };
}

export function patchFromRevertedToPending(order: OperationalOrder): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryState: "pending",
    financialDisposition: "chargeable",
    status: "submitted",
    actualDeliveryDate: null,
  };
}

export function captureDeliveryToggleSnapshot(
  order: OperationalOrder,
): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryState: order.deliveryState,
    financialDisposition: order.financialDisposition,
    status: order.status,
    actualDeliveryDate: order.actualDeliveryDate,
    deliveryIssueType: order.deliveryIssueType,
    deliveryResolutionType: order.deliveryResolutionType,
  };
}

export function patchFromIssueReported(
  order: OperationalOrder,
  input: {
    issueType: OperationalOrder["deliveryIssueType"];
    resolutionType: OperationalOrder["deliveryResolutionType"];
    hrNotes: string | null;
  },
): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryState: "issue_open",
    financialDisposition: "on_hold",
    deliveryIssueType: input.issueType,
    deliveryResolutionType: input.resolutionType,
    hrDeliveryNotes: input.hrNotes ?? order.hrDeliveryNotes,
  };
}

export function patchFromResolutionUpdated(
  order: OperationalOrder,
  input: {
    resolutionType: OperationalOrder["deliveryResolutionType"];
    hrNotes: string | null;
  },
): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryResolutionType: input.resolutionType,
    hrDeliveryNotes: input.hrNotes ?? order.hrDeliveryNotes,
    financialDisposition: "on_hold",
  };
}

export function patchFromConfirmedResolved(
  order: OperationalOrder,
  actualDeliveryDate: string,
): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryState: "resolved",
    financialDisposition: "chargeable",
    status: "fulfilled",
    actualDeliveryDate,
  };
}

export function patchFromWaived(
  order: OperationalOrder,
  hrNotes: string | null,
): DeliveryOrderPatch {
  return {
    id: order.id,
    deliveryState: "resolved",
    financialDisposition: "waived",
    hrDeliveryNotes: hrNotes ?? order.hrDeliveryNotes,
  };
}

export function patchFromNotesUpdated(
  order: OperationalOrder,
  hrNotes: string | null,
): DeliveryOrderPatch {
  return {
    id: order.id,
    hrDeliveryNotes: hrNotes,
  };
}
