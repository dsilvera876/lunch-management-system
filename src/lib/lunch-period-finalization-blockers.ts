import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_ISSUE_TYPES,
  DELIVERY_RESOLUTION_TYPES,
  DELIVERY_STATES,
  FINANCIAL_DISPOSITIONS,
  type DeliveryIssueType,
  type DeliveryResolutionType,
  type DeliveryState,
  type FinancialDisposition,
} from "@/lib/delivery-reconciliation";
import type {
  OperationalOrder,
  OperationalOrderItem,
  OperationalOrderStatus,
} from "@/lib/operational-orders";
import type { MenuItemType } from "@/lib/menu-items";

export const FINALIZATION_BLOCKER_CATEGORIES = [
  "pending_delivery",
  "open_issue",
  "financial_hold",
] as const;

export type FinalizationBlockerCategory =
  (typeof FINALIZATION_BLOCKER_CATEGORIES)[number];

export type FinalizationBlockerReasons = {
  pendingDelivery: boolean;
  openIssue: boolean;
  financialHold: boolean;
};

export type FinalizationBlockerPeriod = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "open" | "finalized";
};

export type FinancialFinalizationBlocker = {
  orderId: string;
  category: FinalizationBlockerCategory;
  reasons: FinalizationBlockerReasons;
  employeeName: string;
  providerName: string;
  orderDate: string;
  deliveryDate: string;
  officeLocationName: string;
  status: OperationalOrderStatus;
  deliveryState: DeliveryState;
  financialDisposition: FinancialDisposition;
  deliveryIssueType: DeliveryIssueType | null;
  deliveryResolutionType: DeliveryResolutionType | null;
};

export type FinancialFinalizationBlockerSummary = {
  period: FinalizationBlockerPeriod;
  counts: Record<"total" | FinalizationBlockerCategory, number>;
  blockers: FinancialFinalizationBlocker[];
};

export type HrFinalizationBlockerOrder = {
  category: FinalizationBlockerCategory;
  reasons: FinalizationBlockerReasons;
  order: OperationalOrder;
  snapshotMenuItems: Array<{
    id: string;
    name: string;
    itemType: string;
    unitLabel: string;
    price: number;
  }>;
};

export type HrFinalizationBlockerOrders = {
  period: FinalizationBlockerPeriod;
  orders: HrFinalizationBlockerOrder[];
};

export class FinalizationBlockerDataError extends Error {
  constructor() {
    super("Unable to load financial finalization blockers.");
    this.name = "FinalizationBlockerDataError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(`${value}T12:00:00-05:00`));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

function parsePeriod(value: unknown): FinalizationBlockerPeriod {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    typeof value.label !== "string" ||
    !value.label.trim() ||
    !isDate(value.start_date) ||
    !isDate(value.end_date) ||
    !isOneOf(value.status, ["open", "finalized"] as const)
  ) {
    throw new FinalizationBlockerDataError();
  }

  return {
    id: value.id,
    label: value.label,
    startDate: value.start_date,
    endDate: value.end_date,
    status: value.status,
  };
}

function parseReasons(value: unknown): FinalizationBlockerReasons {
  if (
    !isRecord(value) ||
    typeof value.pending_delivery !== "boolean" ||
    typeof value.open_issue !== "boolean" ||
    typeof value.financial_hold !== "boolean" ||
    !(value.pending_delivery || value.open_issue || value.financial_hold)
  ) {
    throw new FinalizationBlockerDataError();
  }

  return {
    pendingDelivery: value.pending_delivery,
    openIssue: value.open_issue,
    financialHold: value.financial_hold,
  };
}

function parseCategory(value: unknown): FinalizationBlockerCategory {
  if (!isOneOf(value, FINALIZATION_BLOCKER_CATEGORIES)) {
    throw new FinalizationBlockerDataError();
  }
  return value;
}

function parseSafeBlocker(value: unknown): FinancialFinalizationBlocker {
  if (
    !isRecord(value) ||
    !isUuid(value.order_id) ||
    typeof value.employee_name !== "string" ||
    typeof value.provider_name !== "string" ||
    !isDate(value.order_date) ||
    !isDate(value.delivery_date) ||
    typeof value.office_location_name !== "string" ||
    !isOneOf(value.status, ["submitted", "fulfilled", "cancelled"] as const) ||
    !isOneOf(value.delivery_state, DELIVERY_STATES) ||
    !isOneOf(value.financial_disposition, FINANCIAL_DISPOSITIONS) ||
    !(
      value.delivery_issue_type === null ||
      isOneOf(value.delivery_issue_type, DELIVERY_ISSUE_TYPES)
    ) ||
    !(
      value.delivery_resolution_type === null ||
      isOneOf(value.delivery_resolution_type, DELIVERY_RESOLUTION_TYPES)
    )
  ) {
    throw new FinalizationBlockerDataError();
  }

  return {
    orderId: value.order_id,
    category: parseCategory(value.category),
    reasons: parseReasons(value.reasons),
    employeeName: value.employee_name,
    providerName: value.provider_name,
    orderDate: value.order_date,
    deliveryDate: value.delivery_date,
    officeLocationName: value.office_location_name,
    status: value.status,
    deliveryState: value.delivery_state,
    financialDisposition: value.financial_disposition,
    deliveryIssueType: value.delivery_issue_type,
    deliveryResolutionType: value.delivery_resolution_type,
  };
}

function parseCounts(value: unknown): FinancialFinalizationBlockerSummary["counts"] {
  if (!isRecord(value)) {
    throw new FinalizationBlockerDataError();
  }

  const countKeys = ["total", ...FINALIZATION_BLOCKER_CATEGORIES] as const;
  for (const key of countKeys) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0) {
      throw new FinalizationBlockerDataError();
    }
  }

  return {
    total: Number(value.total),
    pending_delivery: Number(value.pending_delivery),
    open_issue: Number(value.open_issue),
    financial_hold: Number(value.financial_hold),
  };
}

export function parseFinancialFinalizationBlockerSummary(
  value: unknown,
): FinancialFinalizationBlockerSummary {
  if (!isRecord(value) || !Array.isArray(value.blockers)) {
    throw new FinalizationBlockerDataError();
  }

  const period = parsePeriod(value.period);
  const counts = parseCounts(value.counts);
  const blockers = value.blockers.map(parseSafeBlocker);
  const ids = new Set(blockers.map((blocker) => blocker.orderId));

  if (
    ids.size !== blockers.length ||
    counts.total !== blockers.length ||
    counts.pending_delivery + counts.open_issue + counts.financial_hold !== counts.total
  ) {
    throw new FinalizationBlockerDataError();
  }

  for (const category of FINALIZATION_BLOCKER_CATEGORIES) {
    if (counts[category] !== blockers.filter((row) => row.category === category).length) {
      throw new FinalizationBlockerDataError();
    }
  }

  return { period, counts, blockers };
}

function parseItem(value: unknown): OperationalOrderItem {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !Number.isSafeInteger(value.quantity) ||
    Number(value.quantity) < 1 ||
    !isOneOf(value.item_type, ["main", "side", "standalone"] as const) ||
    typeof value.unit_label !== "string" ||
    !isNullableString(value.display_category)
  ) {
    throw new FinalizationBlockerDataError();
  }

  return {
    name: value.name,
    quantity: Number(value.quantity),
    itemType: value.item_type as MenuItemType,
    unitLabel: value.unit_label,
    displayCategory: value.display_category,
  };
}

function parseSnapshotMenuItem(value: unknown): HrFinalizationBlockerOrder["snapshotMenuItems"][number] {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    typeof value.name !== "string" ||
    !isOneOf(value.item_type, ["main", "side", "standalone"] as const) ||
    typeof value.unit_label !== "string" ||
    typeof value.price !== "number" ||
    !Number.isFinite(value.price) ||
    value.price < 0
  ) {
    throw new FinalizationBlockerDataError();
  }

  return {
    id: value.id,
    name: value.name,
    itemType: value.item_type,
    unitLabel: value.unit_label,
    price: value.price,
  };
}

function parseHrOrder(value: unknown): HrFinalizationBlockerOrder {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.profile_id) ||
    !isOneOf(value.status, ["submitted", "fulfilled", "cancelled"] as const) ||
    !isOneOf(value.delivery_state, DELIVERY_STATES) ||
    !isOneOf(value.financial_disposition, FINANCIAL_DISPOSITIONS) ||
    !(
      value.delivery_issue_type === null ||
      isOneOf(value.delivery_issue_type, DELIVERY_ISSUE_TYPES)
    ) ||
    !(
      value.delivery_resolution_type === null ||
      isOneOf(value.delivery_resolution_type, DELIVERY_RESOLUTION_TYPES)
    ) ||
    !isNullableString(value.actual_delivery_date) ||
    (value.actual_delivery_date !== null && !isDate(value.actual_delivery_date)) ||
    !isUuid(value.lunch_day_id) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at) ||
    !isNullableString(value.special_instructions) ||
    !(
      value.meal_quantity === null ||
      (Number.isSafeInteger(value.meal_quantity) && Number(value.meal_quantity) >= 1)
    ) ||
    typeof value.is_late_order !== "boolean" ||
    typeof value.office_location_name !== "string" ||
    !isNullableString(value.office_location_address) ||
    typeof value.employee_name !== "string" ||
    !isNullableString(value.late_order_created_by_name) ||
    !isUuid(value.provider_id) ||
    typeof value.provider_name !== "string" ||
    !isDate(value.order_date) ||
    !isDate(value.delivery_date) ||
    !isNullableString(value.hr_delivery_notes) ||
    !Array.isArray(value.snapshot_menu_items) ||
    !Array.isArray(value.items)
  ) {
    throw new FinalizationBlockerDataError();
  }

  const category = parseCategory(value.blocker_category);
  const reasons = parseReasons(value.blocker_reasons);

  return {
    category,
    reasons,
    snapshotMenuItems: value.snapshot_menu_items.map(parseSnapshotMenuItem),
    order: {
      id: value.id,
      profileId: value.profile_id,
      status: value.status,
      deliveryState: value.delivery_state,
      financialDisposition: value.financial_disposition,
      deliveryIssueType: value.delivery_issue_type,
      deliveryResolutionType: value.delivery_resolution_type,
      hrDeliveryNotes: value.hr_delivery_notes,
      actualDeliveryDate: value.actual_delivery_date,
      lunchDayId: value.lunch_day_id,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
      specialInstructions: value.special_instructions,
      mealQuantity: value.meal_quantity === null ? null : Number(value.meal_quantity),
      employeeName: value.employee_name,
      officeLocationName: value.office_location_name,
      officeLocationAddress: value.office_location_address,
      orderDate: value.order_date,
      deliveryDate: value.delivery_date,
      providerId: value.provider_id,
      providerName: value.provider_name,
      items: value.items.map(parseItem),
      isLateOrder: value.is_late_order,
      lateOrderCreatedByName: value.late_order_created_by_name,
      lateOrderDispatched: false,
    },
  };
}

export function parseHrFinalizationBlockerOrders(
  value: unknown,
): HrFinalizationBlockerOrders {
  if (!isRecord(value) || !Array.isArray(value.orders)) {
    throw new FinalizationBlockerDataError();
  }

  const orders = value.orders.map(parseHrOrder);
  const ids = new Set(orders.map(({ order }) => order.id));
  if (ids.size !== orders.length) {
    throw new FinalizationBlockerDataError();
  }

  return { period: parsePeriod(value.period), orders };
}

async function loadRpc(
  supabase: SupabaseClient,
  rpcName:
    | "get_lunch_period_finalization_blockers"
    | "get_hr_lunch_period_finalization_blocker_orders",
  periodId: string,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(rpcName, { p_period_id: periodId });
  if (error || data === null || data === undefined) {
    console.error("Unable to load financial finalization blocker data", {
      operation: rpcName,
      code: error?.code ?? "invalid_response",
    });
    throw new FinalizationBlockerDataError();
  }
  return data;
}

export async function loadFinancialFinalizationBlockers(
  supabase: SupabaseClient,
  periodId: string,
): Promise<FinancialFinalizationBlockerSummary> {
  const result = parseFinancialFinalizationBlockerSummary(
    await loadRpc(supabase, "get_lunch_period_finalization_blockers", periodId),
  );
  if (result.period.id !== periodId) {
    throw new FinalizationBlockerDataError();
  }
  return result;
}

export async function loadHrFinalizationBlockerOrders(
  supabase: SupabaseClient,
  periodId: string,
): Promise<HrFinalizationBlockerOrders> {
  const result = parseHrFinalizationBlockerOrders(
    await loadRpc(supabase, "get_hr_lunch_period_finalization_blocker_orders", periodId),
  );
  if (result.period.id !== periodId) {
    throw new FinalizationBlockerDataError();
  }
  return result;
}
