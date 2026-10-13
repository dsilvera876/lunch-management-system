import { canToggleDeliveryCheckbox } from "@/lib/delivery-reconciliation";
import {
  captureDeliveryToggleSnapshot,
  patchDeliveryOrder,
  type DeliveryOrderPatch,
} from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";

export type DeliveryToggleMutationResult =
  | { success: true; patch: DeliveryOrderPatch }
  | { success: false; error: string };

/**
 * Validate a delivery checkbox toggle and capture rollback state.
 * Does not mutate order delivery state — UI stays on server truth until confirmation.
 */
export function prepareDeliveryToggle(
  orders: OperationalOrder[],
  orderId: string,
  inFlightOrderIds: ReadonlySet<string>,
):
  | { kind: "noop" }
  | { kind: "busy" }
  | {
      kind: "ready";
      rollbackSnapshot: DeliveryOrderPatch;
    } {
  if (inFlightOrderIds.has(orderId)) {
    return { kind: "busy" };
  }

  const order = orders.find((entry) => entry.id === orderId);
  if (!order || !canToggleDeliveryCheckbox(order)) {
    return { kind: "noop" };
  }

  return {
    kind: "ready",
    rollbackSnapshot: captureDeliveryToggleSnapshot(order),
  };
}

/** @deprecated use prepareDeliveryToggle — kept for transitional imports */
export function beginDeliveryToggle(
  orders: OperationalOrder[],
  orderId: string,
  _nextChecked: boolean,
  _actualDeliveryDate: string,
  inFlightOrderIds: ReadonlySet<string> = new Set(),
):
  | { kind: "noop" }
  | { kind: "busy" }
  | {
      kind: "ready";
      rollbackSnapshot: DeliveryOrderPatch;
      optimisticOrders: OperationalOrder[];
    } {
  const prepared = prepareDeliveryToggle(orders, orderId, inFlightOrderIds);
  if (prepared.kind !== "ready") {
    return prepared;
  }

  return {
    kind: "ready",
    rollbackSnapshot: prepared.rollbackSnapshot,
    optimisticOrders: orders,
  };
}

/** Apply a completed server mutation when the toggle generation still matches. */
export function finishDeliveryToggle(
  orders: OperationalOrder[],
  expectedVersion: number,
  currentVersion: number,
  rollbackSnapshot: DeliveryOrderPatch,
  result: DeliveryToggleMutationResult,
  errorMessage: string,
): {
  orders: OperationalOrder[];
  rowError: string | null;
  successMessage: string | null;
} {
  if (currentVersion !== expectedVersion) {
    return { orders, rowError: null, successMessage: null };
  }

  if (!result.success) {
    return {
      orders: patchDeliveryOrder(orders, rollbackSnapshot),
      rowError: errorMessage,
      successMessage: null,
    };
  }

  const nextState = result.patch.deliveryState;
  const successMessage =
    nextState === "delivered"
      ? "Delivery confirmed."
      : nextState === "pending"
        ? "Reverted to pending."
        : "Delivery updated.";

  return {
    orders: patchDeliveryOrder(orders, result.patch),
    rowError: null,
    successMessage,
  };
}
