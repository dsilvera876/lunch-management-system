import type { OperationalOrder } from "@/lib/operational-orders";
import type { SnapshotOrderPayload } from "@/lib/order-payload";

export type HrOrderMutationBlockReason =
  | "late_order"
  | "not_submitted"
  | "delivery_not_pending"
  | "primary_dispatch_sent"
  | "not_hr";

export function canHrMutateTodaysOrder(input: {
  order: Pick<
    OperationalOrder,
    "isLateOrder" | "status" | "deliveryState"
  >;
  canMutateHr: boolean;
  primaryDispatchLocksOrders: boolean;
}): boolean {
  if (!input.canMutateHr) {
    return false;
  }

  if (input.order.isLateOrder) {
    return false;
  }

  if (input.order.status !== "submitted") {
    return false;
  }

  if (input.order.deliveryState !== "pending") {
    return false;
  }

  if (input.primaryDispatchLocksOrders) {
    return false;
  }

  return true;
}

export function hrOrderMutationBlockReason(input: {
  order: Pick<
    OperationalOrder,
    "isLateOrder" | "status" | "deliveryState"
  >;
  canMutateHr: boolean;
  primaryDispatchLocksOrders: boolean;
}): HrOrderMutationBlockReason | null {
  if (!input.canMutateHr) {
    return "not_hr";
  }

  if (input.order.isLateOrder) {
    return "late_order";
  }

  if (input.order.status !== "submitted") {
    return "not_submitted";
  }

  if (input.order.deliveryState !== "pending") {
    return "delivery_not_pending";
  }

  if (input.primaryDispatchLocksOrders) {
    return "primary_dispatch_sent";
  }

  return null;
}

export function normalizeHrOrderMutationReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 1000) {
    return null;
  }
  return trimmed;
}

export function providerPrimaryDispatchLocksHrOrderMutation(status: {
  hasSuccessfulPrimarySend: boolean;
  latestStatus: string;
}): boolean {
  if (status.hasSuccessfulPrimarySend) {
    return true;
  }

  return status.latestStatus === "pending";
}

export function mapHrOrderMutationError(message: string): string {
  const normalized = message.trim();

  if (normalized.includes("Order changed; refresh and try again")) {
    return "This order was updated elsewhere. Refresh the page and try again.";
  }

  if (normalized.includes("Provider primary order dispatch already sent")) {
    return "The provider order email was already sent, so this order can no longer be changed here.";
  }

  if (normalized.includes("No changes were made")) {
    return "Change at least one item or quantity before saving.";
  }

  if (normalized.includes("A reason is required")) {
    return "Enter a reason for this HR change.";
  }

  if (normalized.includes("HR operational mutation access required")) {
    return "You do not have permission to change employee orders.";
  }

  if (normalized.includes("Late orders cannot be changed")) {
    return "Late orders must be managed from Late Orders.";
  }

  return normalized || "Unable to complete the HR order change.";
}

export type OrderItemsAuditLine = {
  menu_item_id: string;
  name: string;
  item_type: string;
  unit_label: string;
  display_category: string | null;
  quantity: number;
  unit_price: number;
};

export function deriveSnapshotPayloadFromAuditItems(
  items: OrderItemsAuditLine[],
  mealQuantity: number | null,
): SnapshotOrderPayload {
  const main = items.find((item) => item.item_type === "main") ?? null;
  const sides = items.filter((item) => item.item_type === "side");
  const standalone = items.filter((item) => item.item_type === "standalone");

  return {
    meal_quantity: main ? mealQuantity ?? 1 : null,
    main_menu_item_id: main?.menu_item_id ?? null,
    side_menu_item_ids: sides.map((item) => item.menu_item_id),
    standalone_items: standalone.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
    })),
  };
}

export function snapshotPayloadToRpcJson(payload: SnapshotOrderPayload): Record<string, unknown> {
  return {
    meal_quantity: payload.meal_quantity,
    main_menu_item_id: payload.main_menu_item_id,
    side_menu_item_ids: payload.side_menu_item_ids,
    standalone_items: payload.standalone_items.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
    })),
  };
}
