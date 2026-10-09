import type { HrStaffOrderEditContext } from "@/app/admin/todays-orders/actions";
import type { OrderItemsAuditLine } from "@/lib/hr-todays-order-mutation";
import { deriveSnapshotPayloadFromAuditItems } from "@/lib/hr-todays-order-mutation";

/** Draft fields cleared whenever an edit session ends or a new load begins. */
export type HrEditModalDraftFields = {
  context: HrStaffOrderEditContext | null;
  reason: string;
  formError: string | null;
  loadError: string | null;
};

export const EMPTY_HR_EDIT_MODAL_DRAFT: HrEditModalDraftFields = {
  context: null,
  reason: "",
  formError: null,
  loadError: null,
};

/** Clears persisted modal draft so the next open starts from server state only. */
export function hrEditModalDraftOnSessionEnd(): HrEditModalDraftFields {
  return { ...EMPTY_HR_EDIT_MODAL_DRAFT };
}

/** Clears draft and unmounts the order form before refetching edit context. */
export function hrEditModalDraftOnLoadStart(): HrEditModalDraftFields {
  return hrEditModalDraftOnSessionEnd();
}

export function hrEditFormMountKey(orderId: string, updatedAt: string): string {
  return `${orderId}:${updatedAt}`;
}

export function deriveHrEditFormDefaults(
  items: OrderItemsAuditLine[],
  mealQuantity: number | null,
) {
  const payload = deriveSnapshotPayloadFromAuditItems(items, mealQuantity);
  return {
    mainMenuItemId: payload.main_menu_item_id,
    sideMenuItemIds: payload.side_menu_item_ids,
    mealQuantity: payload.meal_quantity ?? 1,
    standaloneQuantities: Object.fromEntries(
      payload.standalone_items.map((item) => [item.menu_item_id, item.quantity]),
    ),
  };
}

/**
 * When a fetch completes after the modal closed or the order changed, ignore it so
 * stale context never rehydrates the form.
 */
export function shouldApplyHrEditContextFetch(input: {
  requestedOrderId: string;
  currentOrderId: string;
  cancelled: boolean;
}): boolean {
  if (input.cancelled) {
    return false;
  }
  return input.requestedOrderId === input.currentOrderId;
}
