import {
  getMenuItemTypeLabel,
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  normalizeDisplayCategory,
  type MenuItemType,
} from "@/lib/menu-items";
import {
  isPreparationQualifyingOrder,
  type DeliveryIssueType,
  type DeliveryResolutionType,
  type DeliveryState,
  type FinancialDisposition,
} from "@/lib/delivery-reconciliation";

export type OperationalOrderStatus = "submitted" | "fulfilled" | "cancelled";

export type OperationalOrderItem = {
  name: string;
  quantity: number;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory: string | null;
};

export type OperationalOrder = {
  id: string;
  profileId: string;
  status: OperationalOrderStatus;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
  deliveryIssueType: DeliveryIssueType | null;
  deliveryResolutionType: DeliveryResolutionType | null;
  hrDeliveryNotes: string | null;
  actualDeliveryDate: string | null;
  lunchDayId: string;
  createdAt: string;
  specialInstructions: string | null;
  mealQuantity: number | null;
  employeeName: string;
  officeLocationName: string;
  officeLocationAddress: string | null;
  orderDate: string;
  deliveryDate: string;
  providerId: string;
  providerName: string;
  items: OperationalOrderItem[];
  isLateOrder: boolean;
  lateOrderCreatedByName: string | null;
  lateOrderDispatched: boolean;
};

export type PreparationLine = {
  name: string;
  quantity: number;
  unitLabel: string;
};

export type PreparationSection = {
  label: string;
  lines: PreparationLine[];
};

export type OfficeOperationalGroup = {
  name: string;
  orders: OperationalOrder[];
};

export type ProviderOperationalGroup = {
  providerId: string;
  providerName: string;
  officeSummaries: Array<{ name: string; orderCount: number }>;
  preparationSections: PreparationSection[];
  offices: OfficeOperationalGroup[];
};

export type OperationalDeliveryReport = {
  deliveryDate: string;
  providers: ProviderOperationalGroup[];
  totalOrders: number;
};

const PREPARATION_SECTION_ORDER = ["Mains", "Sides"] as const;

function preparationSectionForItem(item: OperationalOrderItem): string {
  if (item.itemType === "main") {
    return "Mains";
  }

  if (item.itemType === "side") {
    return "Sides";
  }

  return (
    normalizeDisplayCategory(item.displayCategory) ??
    (item.displayCategory?.trim()
      ? item.displayCategory.trim()
      : "Other items")
  );
}

function aggregatePreparationLines(
  orders: OperationalOrder[],
): PreparationSection[] {
  const totals = new Map<string, PreparationLine>();

  for (const order of orders) {
    if (!isPreparationQualifyingOrder(order)) {
      continue;
    }

    for (const item of order.items) {
      const section = preparationSectionForItem(item);
      const key = `${section}\0${item.name}\0${item.unitLabel}`;
      const existing = totals.get(key);

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        totals.set(key, {
          name: item.name,
          quantity: item.quantity,
          unitLabel: item.unitLabel,
        });
      }
    }
  }

  const sections = new Map<string, PreparationLine[]>();

  for (const [key, line] of totals) {
    const section = key.split("\0")[0] ?? "Other items";
    const bucket = sections.get(section) ?? [];
    bucket.push(line);
    sections.set(section, bucket);
  }

  const orderedLabels = [
    ...PREPARATION_SECTION_ORDER,
    ...Array.from(sections.keys())
      .filter(
        (label) =>
          !(PREPARATION_SECTION_ORDER as readonly string[]).includes(label),
      )
      .sort((a, b) => a.localeCompare(b)),
  ];

  return orderedLabels
    .filter((label) => sections.has(label))
    .map((label) => ({
      label,
      lines: (sections.get(label) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
}

function buildOfficeSummaries(
  offices: OfficeOperationalGroup[],
): Array<{ name: string; orderCount: number }> {
  return offices
    .map((office) => ({
      name: office.name,
      orderCount: office.orders.filter((order) => isPreparationQualifyingOrder(order))
        .length,
    }))
    .filter((summary) => summary.orderCount > 0);
}

export function groupOperationalOrdersByProvider(
  orders: OperationalOrder[],
): ProviderOperationalGroup[] {
  const byProvider = new Map<string, OperationalOrder[]>();

  for (const order of orders) {
    const bucket = byProvider.get(order.providerId) ?? [];
    bucket.push(order);
    byProvider.set(order.providerId, bucket);
  }

  const providers: ProviderOperationalGroup[] = [];

  for (const providerOrders of byProvider.values()) {
    const first = providerOrders[0];
    if (!first) {
      continue;
    }

    const byOffice = new Map<string, OperationalOrder[]>();

    for (const order of providerOrders) {
      const officeName = order.officeLocationName || "No delivery location";
      const bucket = byOffice.get(officeName) ?? [];
      bucket.push(order);
      byOffice.set(officeName, bucket);
    }

    const offices = Array.from(byOffice.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, officeOrders]) => ({
        name,
        orders: officeOrders.sort((a, b) =>
          a.employeeName.localeCompare(b.employeeName),
        ),
      }))
      .filter((office) => office.orders.length > 0);

    if (offices.length === 0) {
      continue;
    }

    const preparationSections = aggregatePreparationLines(providerOrders);

    providers.push({
      providerId: first.providerId,
      providerName: first.providerName,
      officeSummaries: buildOfficeSummaries(offices),
      preparationSections,
      offices,
    });
  }

  return providers.sort((a, b) =>
    a.providerName.localeCompare(b.providerName),
  );
}

export function buildOperationalDeliveryReport(
  orders: OperationalOrder[],
  deliveryDate: string,
): OperationalDeliveryReport {
  return {
    deliveryDate,
    providers: groupOperationalOrdersByProvider(orders),
    totalOrders: orders.length,
  };
}

export type OperationalOrderItemView = OperationalOrderItem & {
  groupedLabel: string;
};

export type OperationalOrderDetailGroups = {
  mealQuantity: number | null;
  mains: OperationalOrderItemView[];
  sides: OperationalOrderItemView[];
  standaloneByCategory: Record<string, OperationalOrderItemView[]>;
};

export function buildOperationalOrderDetailGroups(
  order: OperationalOrder,
): OperationalOrderDetailGroups {
  const grouped = groupMenuItemsByType(order.items);
  const standaloneByCategory = groupStandaloneItemsByCategory(grouped.standalone);

  const decorate = (items: OperationalOrderItem[]): OperationalOrderItemView[] =>
    items.map((item) => ({
      ...item,
      groupedLabel: item.name,
    }));

  return {
    mealQuantity: order.mealQuantity,
    mains: decorate(grouped.main),
    sides: decorate(grouped.side),
    standaloneByCategory: Object.fromEntries(
      Object.entries(standaloneByCategory).map(([category, items]) => [
        category,
        decorate(items),
      ]),
    ),
  };
}

export function formatPreparationLine(line: PreparationLine): string {
  if (!line.unitLabel || line.unitLabel === "Each") {
    return `${line.name} ×${line.quantity}`;
  }

  return `${line.name} (${line.unitLabel}) ×${line.quantity}`;
}

export function getPreparationSectionHeading(sectionLabel: string): string {
  if (sectionLabel === "Mains" || sectionLabel === "Sides") {
    return sectionLabel;
  }

  return sectionLabel;
}

export function isQualifyingOperationalOrder(order: OperationalOrder): boolean {
  return isPreparationQualifyingOrder(order);
}

export function canFulfillOperationalOrder(
  order: OperationalOrder,
): boolean {
  return order.status === "submitted" && order.deliveryState === "pending";
}

/** Provider print payloads must exclude account/financial fields by design. */
export type ProviderPrintOrder = Pick<
  OperationalOrder,
  | "employeeName"
  | "officeLocationName"
  | "mealQuantity"
  | "specialInstructions"
  | "status"
  | "deliveryState"
  | "deliveryIssueType"
  | "items"
>;

export function toProviderPrintOrder(
  order: OperationalOrder,
): ProviderPrintOrder {
  return {
    employeeName: order.employeeName,
    officeLocationName: order.officeLocationName,
    mealQuantity: order.mealQuantity,
    specialInstructions: order.specialInstructions,
    status: order.status,
    deliveryState: order.deliveryState,
    deliveryIssueType: order.deliveryIssueType,
    items: order.items.map((item) => ({ ...item })),
  };
}

export function assertProviderPrintPayloadSafe(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const forbidden = [
    "email",
    "role",
    "subsidy",
    "payroll",
    "net_deduction",
    "unit_price",
    "profile_id",
  ];

  const json = JSON.stringify(payload).toLowerCase();

  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Provider print payload must not include ${key}`);
    }
  }
}

export function getMenuItemTypeSectionLabel(itemType: MenuItemType): string {
  return getMenuItemTypeLabel(itemType);
}
