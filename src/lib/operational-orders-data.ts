import type { PostgrestError } from "@supabase/supabase-js";
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
  status: string;
  delivery_state: string;
  financial_disposition: string;
  delivery_issue_type: string | null;
  delivery_resolution_type: string | null;
  actual_delivery_date: string | null;
  lunch_day_id: string;
  created_at: string;
  special_instructions: string | null;
  meal_quantity: number | null;
  is_late_order: boolean;
  office_location_name: string | null;
  office_location_address: string | null;
  late_order_creator: ReturnType<typeof getRelated<{ full_name: string | null }>>;
  order_delivery_reconciliation: ReturnType<
    typeof getRelated<{ hr_delivery_notes: string | null }>
  >;
  profiles: ReturnType<typeof getRelated<{ full_name: string | null }>>;
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

export function parseOperationalOrderRow(row: OperationalOrderRow): OperationalOrder | null {
  const lunchDay = getRelated(row.lunch_days);
  const provider = lunchDay ? getRelated(lunchDay.lunch_providers) : null;

  if (!lunchDay?.lunch_date || !provider?.id || !provider.name) {
    return null;
  }

  const profile = getRelated(row.profiles);
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
  const lateCreator = getRelated(row.late_order_creator);

  return {
    id: row.id,
    status: row.status as OperationalOrderStatus,
    deliveryState: row.delivery_state as DeliveryState,
    financialDisposition: row.financial_disposition as FinancialDisposition,
    deliveryIssueType: row.delivery_issue_type as DeliveryIssueType | null,
    deliveryResolutionType: row.delivery_resolution_type as DeliveryResolutionType | null,
    hrDeliveryNotes: reconciliation?.hr_delivery_notes ?? null,
    actualDeliveryDate: row.actual_delivery_date,
    lunchDayId: row.lunch_day_id,
    createdAt: row.created_at,
    specialInstructions: row.special_instructions,
    mealQuantity: row.meal_quantity,
    employeeName: profile?.full_name?.trim() || "Unnamed employee",
    officeLocationName: row.office_location_name?.trim() || "No delivery location",
    officeLocationAddress: row.office_location_address,
    orderDate: lunchDay.order_date ?? lunchDay.lunch_date,
    deliveryDate: lunchDay.lunch_date,
    providerId: provider.id,
    providerName: provider.name,
    items,
    isLateOrder: row.is_late_order,
    lateOrderCreatedByName: lateCreator?.full_name?.trim() || null,
    lateOrderDispatched: false,
  };
}

/** PostgREST FK: `orders.profile_id` → `profiles.id` (see pg_constraint `orders_profile_id_fkey`). */
export const OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY = "orders_profile_id_fkey";

export const OPERATIONAL_ORDER_LATE_CREATOR_PROFILE_FKEY =
  "orders_late_order_created_by_fkey";

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
  status,
  delivery_state,
  financial_disposition,
  delivery_issue_type,
  delivery_resolution_type,
  actual_delivery_date,
  lunch_day_id,
  created_at,
  special_instructions,
  meal_quantity,
  is_late_order,
  office_location_name,
  office_location_address,
  late_order_creator:profiles!${OPERATIONAL_ORDER_LATE_CREATOR_PROFILE_FKEY} (
    full_name
  ),
  order_delivery_reconciliation (
    hr_delivery_notes
  ),
  profiles!${OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY} (
    full_name
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
