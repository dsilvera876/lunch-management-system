import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getRelated } from "@/lib/format";
import type {
  DeliveryIssueType,
  DeliveryResolutionType,
  DeliveryState,
  FinancialDisposition,
} from "@/lib/delivery-reconciliation";
import {
  type OperationalOrder,
  type OperationalOrderItem,
  type OperationalOrderStatus,
} from "@/lib/operational-orders";
import type { MenuItemType } from "@/lib/menu-items";

export type OperationalOrderRow = {
  id: string;
  profile_id: string;
  status: string;
  delivery_state: string;
  financial_disposition: string;
  delivery_issue_type: string | null;
  delivery_resolution_type: string | null;
  actual_delivery_date: string | null;
  lunch_day_id: string;
  created_at: string;
  updated_at: string;
  special_instructions: string | null;
  meal_quantity: number | null;
  is_late_order: boolean;
  office_location_name: string | null;
  office_location_address: string | null;
  order_delivery_reconciliation: ReturnType<
    typeof getRelated<{ hr_delivery_notes: string | null }>
  >;
  lunch_days: ReturnType<
    typeof getRelated<{
      lunch_date: string;
      order_date: string | null;
      provider_id: string;
      lunch_providers: ReturnType<typeof getRelated<{ id: string; name: string }>>;
    }>
  >;
  order_items: Array<{
    quantity: number;
    menu_items: ReturnType<
      typeof getRelated<{
        name: string;
        item_type: string;
        unit_label: string;
        display_category: string | null;
      }>
    >;
  }>;
};

export type OperationalOrderDisplayNameRow = {
  order_id: string;
  employee_name: string | null;
  late_order_created_by_name: string | null;
};

export type OperationalOrderDisplayNames = {
  employeeName: string | null;
  lateOrderCreatedByName: string | null;
};

export const OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE = 200;

export class OperationalOrderDisplayNamesError extends Error {
  constructor(message = "Unable to load employee names for operational orders.") {
    super(message);
    this.name = "OperationalOrderDisplayNamesError";
  }
}

export async function loadOperationalOrderDisplayNames(
  supabase: SupabaseClient,
  orderIds: string[],
  logContext: string,
): Promise<Map<string, OperationalOrderDisplayNames>> {
  const uniqueOrderIds = [...new Set(orderIds)];
  const namesByOrderId = new Map<string, OperationalOrderDisplayNames>();

  for (
    let offset = 0;
    offset < uniqueOrderIds.length;
    offset += OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE
  ) {
    const orderIdBatch = uniqueOrderIds.slice(
      offset,
      offset + OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE,
    );
    const { data, error } = await supabase.rpc("list_operational_order_display_names", {
      p_order_ids: orderIdBatch,
    });

    if (error) {
      logOperationalOrdersQueryError(`${logContext}:display-names`, error);
      throw new OperationalOrderDisplayNamesError();
    }

    if (!Array.isArray(data)) {
      console.error(`Invalid operational order display-name response (${logContext})`);
      throw new OperationalOrderDisplayNamesError();
    }

    for (const value of data) {
      const row = value as Partial<OperationalOrderDisplayNameRow>;

      if (
        typeof row.order_id !== "string" ||
        (row.employee_name !== null && typeof row.employee_name !== "string") ||
        (row.late_order_created_by_name !== null &&
          typeof row.late_order_created_by_name !== "string") ||
        !orderIdBatch.includes(row.order_id) ||
        namesByOrderId.has(row.order_id)
      ) {
        console.error(`Invalid operational order display-name row (${logContext})`);
        throw new OperationalOrderDisplayNamesError();
      }

      namesByOrderId.set(row.order_id, {
        employeeName: row.employee_name,
        lateOrderCreatedByName: row.late_order_created_by_name,
      });
    }
  }

  const missingOrderCount = uniqueOrderIds.reduce(
    (count, orderId) => count + (namesByOrderId.has(orderId) ? 0 : 1),
    0,
  );

  if (missingOrderCount > 0) {
    console.error(`Operational order display-name rows were missing (${logContext})`, {
      missingOrderCount,
    });
    throw new OperationalOrderDisplayNamesError();
  }

  return namesByOrderId;
}

export function parseOperationalOrderRow(
  row: OperationalOrderRow,
  displayNames: OperationalOrderDisplayNames,
): OperationalOrder | null {
  const lunchDay = getRelated(row.lunch_days);
  const provider = lunchDay ? getRelated(lunchDay.lunch_providers) : null;

  if (!lunchDay?.lunch_date || !provider?.id || !provider.name) {
    return null;
  }

  const items: OperationalOrderItem[] = row.order_items.map((item) => {
    const menuItem = getRelated(item.menu_items);

    return {
      name: menuItem?.name ?? "Menu item",
      quantity: item.quantity,
      itemType: (menuItem?.item_type ?? "standalone") as MenuItemType,
      unitLabel: menuItem?.unit_label ?? "Each",
      displayCategory: menuItem?.display_category ?? null,
    };
  });

  const reconciliation = getRelated(row.order_delivery_reconciliation);
  return {
    id: row.id,
    profileId: row.profile_id,
    status: row.status as OperationalOrderStatus,
    deliveryState: row.delivery_state as DeliveryState,
    financialDisposition: row.financial_disposition as FinancialDisposition,
    deliveryIssueType: row.delivery_issue_type as DeliveryIssueType | null,
    deliveryResolutionType: row.delivery_resolution_type as DeliveryResolutionType | null,
    hrDeliveryNotes: reconciliation?.hr_delivery_notes ?? null,
    actualDeliveryDate: row.actual_delivery_date,
    lunchDayId: row.lunch_day_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    specialInstructions: row.special_instructions,
    mealQuantity: row.meal_quantity,
    employeeName: displayNames.employeeName?.trim() || "Unnamed employee",
    officeLocationName: row.office_location_name?.trim() || "No delivery location",
    officeLocationAddress: row.office_location_address,
    orderDate: lunchDay.order_date ?? lunchDay.lunch_date,
    deliveryDate: lunchDay.lunch_date,
    providerId: provider.id,
    providerName: provider.name,
    items,
    isLateOrder: row.is_late_order,
    lateOrderCreatedByName: displayNames.lateOrderCreatedByName?.trim() || null,
    lateOrderDispatched: false,
  };
}

export async function parseOperationalOrderRows(
  supabase: SupabaseClient,
  rows: OperationalOrderRow[],
  logContext: string,
): Promise<OperationalOrder[]> {
  const namesByOrderId = await loadOperationalOrderDisplayNames(
    supabase,
    rows.map((row) => row.id),
    logContext,
  );

  return rows
    .map((row) => parseOperationalOrderRow(row, namesByOrderId.get(row.id)!))
    .filter((order): order is OperationalOrder => order !== null);
}

export function logOperationalOrdersQueryError(
  logContext: string,
  error: PostgrestError,
): void {
  console.error(`Failed to load operational orders (${logContext})`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

export function failOperationalOrdersQuery(
  logContext: string,
  error: PostgrestError,
  userMessage: string,
): never {
  logOperationalOrdersQueryError(logContext, error);
  throw new Error(userMessage);
}

export function markLateOrderDispatchState(
  orders: OperationalOrder[],
  dispatchedOrderIds: Set<string>,
): OperationalOrder[] {
  return orders.map((order) => ({
    ...order,
    lateOrderDispatched: order.isLateOrder ? dispatchedOrderIds.has(order.id) : false,
  }));
}

export const OPERATIONAL_ORDERS_SELECT = `
  id,
  profile_id,
  status,
  delivery_state,
  financial_disposition,
  delivery_issue_type,
  delivery_resolution_type,
  actual_delivery_date,
  lunch_day_id,
  created_at,
  updated_at,
  special_instructions,
  meal_quantity,
  is_late_order,
  office_location_name,
  office_location_address,
  order_delivery_reconciliation (
    hr_delivery_notes
  ),
  lunch_days!inner (
    lunch_date,
    order_date,
    provider_id,
    lunch_providers (
      id,
      name
    )
  ),
  order_items (
    quantity,
    menu_items (
      id,
      name,
      item_type,
      unit_label,
      display_category
    )
  )
`;
