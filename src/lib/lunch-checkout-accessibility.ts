import { resolvePlaceOrderBlockedMessage } from "@/lib/lunch-checkout";

export const CHECKOUT_LOCATION_REQUIRED_MESSAGE =
  "Choose a delivery location before placing your order.";

export const LOCATION_PICKER_SELECTION_REQUIRED_MESSAGE =
  "Select a delivery location, then choose Use this location.";

export const CART_CLEARED_ANNOUNCEMENT =
  "All completed orders were removed from your lunch cart.";

export const CHECKOUT_SUCCESS_TITLE = "Lunch order placed successfully";

export type CheckoutBlock =
  | { kind: "closed"; message: string }
  | { kind: "location"; message: string }
  | { kind: "unfinished"; message: string }
  | { kind: "cart"; message: string };

export type CheckoutErrorInvalidation =
  | { kind: "draft-or-cart" }
  | { kind: "submitted-cart" }
  | { kind: "delivery-location" }
  | { kind: "unavailable-item"; providerId: string | null }
  | { kind: "ordering-state" }
  | { kind: "authoritative" };

export type CheckoutErrorChange =
  | { kind: "draft" }
  | { kind: "cart"; providerId: string | null; removesProvider: boolean }
  | { kind: "delivery-location" }
  | { kind: "ordering-state" };

export function resolveClientCheckoutErrorInvalidation(
  blockKind: CheckoutBlock["kind"],
): CheckoutErrorInvalidation {
  if (blockKind === "location") {
    return { kind: "delivery-location" };
  }

  if (blockKind === "closed") {
    return { kind: "ordering-state" };
  }

  return { kind: "draft-or-cart" };
}

export function resolveServerCheckoutErrorInvalidation(
  errorCode: string,
  providerId: string | null,
): CheckoutErrorInvalidation {
  switch (errorCode) {
    case "location":
      return { kind: "delivery-location" };
    case "unavailable-item":
      return { kind: "unavailable-item", providerId };
    case "closed":
      return { kind: "ordering-state" };
    case "empty":
    case "composition":
    case "instructions":
      return { kind: "submitted-cart" };
    default:
      return { kind: "authoritative" };
  }
}

/** Returns true only when the state change could correct the displayed error. */
export function shouldInvalidateCheckoutError(
  invalidation: CheckoutErrorInvalidation,
  change: CheckoutErrorChange,
): boolean {
  switch (invalidation.kind) {
    case "draft-or-cart":
      return change.kind === "draft" || change.kind === "cart";
    case "submitted-cart":
      return change.kind === "cart";
    case "delivery-location":
      return change.kind === "delivery-location";
    case "unavailable-item":
      return (
        change.kind === "cart" &&
        (change.providerId === null ||
          (change.removesProvider &&
            invalidation.providerId !== null &&
            change.providerId === invalidation.providerId))
      );
    case "ordering-state":
      return change.kind === "ordering-state";
    case "authoritative":
      return false;
  }
}

/**
 * Mirrors the checkout guard order so a blocked Place Order activation and a
 * form submit report the same correction. Returns null when checkout may proceed.
 */
export function resolveCheckoutBlock(input: {
  orderingOpen: boolean;
  locationRequired: boolean;
  unfinishedDraftMessage: string | null;
  cartReady: boolean;
  canSubmit: boolean;
  guidanceMessage: string | null;
}): CheckoutBlock | null {
  if (!input.orderingOpen) {
    return {
      kind: "closed",
      message: resolvePlaceOrderBlockedMessage(false, false, input.guidanceMessage),
    };
  }

  if (input.locationRequired) {
    return { kind: "location", message: CHECKOUT_LOCATION_REQUIRED_MESSAGE };
  }

  if (input.unfinishedDraftMessage) {
    return { kind: "unfinished", message: input.unfinishedDraftMessage };
  }

  if (!input.cartReady || !input.canSubmit) {
    return {
      kind: "cart",
      message: resolvePlaceOrderBlockedMessage(true, input.canSubmit, input.guidanceMessage),
    };
  }

  return null;
}

/**
 * After a remove control at `removedIndex` disappears, picks the control that
 * now occupies that position, else the previous one. Null means no remove
 * controls remain and focus should go to the cart heading.
 */
export function resolveRemovalFocusIndex(
  remainingCount: number,
  removedIndex: number,
): number | null {
  if (remainingCount <= 0) {
    return null;
  }

  if (removedIndex < 0) {
    return 0;
  }

  return Math.min(removedIndex, remainingCount - 1);
}

export function formatCartLineRemovedAnnouncement(
  itemName: string,
  providerName: string,
): string {
  return `${itemName} removed from your ${providerName} order.`;
}

export function formatCartEntryRemovedAnnouncement(
  providerName: string,
  providerOrderIndex: number,
): string {
  return `${providerName} order ${providerOrderIndex} removed from your lunch cart.`;
}

/** Accessible name for a cart line Remove control (visible label stays "Remove"). */
export function formatCartLineRemoveLabel(itemName: string, providerName: string): string {
  return `Remove ${itemName} from ${providerName} order`;
}

/** Accessible name for removing a completed provider order from the cart. */
export function formatCartEntryRemoveLabel(
  providerName: string,
  providerOrderIndex: number,
): string {
  return `Remove ${providerName} order ${providerOrderIndex} from lunch cart`;
}

/**
 * Appends an invisible, alternating suffix so a repeated identical message
 * still changes the live region text and is announced again.
 */
export function withAnnouncementNonce(message: string, nonce: number): string {
  if (!message) {
    return "";
  }

  return nonce % 2 === 0 ? message : `${message}\u00a0`;
}

export type LocationPickerConfirmation =
  | { ok: true; locationId: string }
  | { ok: false; message: string };

export function resolveLocationPickerConfirmation(
  pendingLocationId: string,
  availableLocationIds: readonly string[],
): LocationPickerConfirmation {
  if (pendingLocationId && availableLocationIds.includes(pendingLocationId)) {
    return { ok: true, locationId: pendingLocationId };
  }

  return { ok: false, message: LOCATION_PICKER_SELECTION_REQUIRED_MESSAGE };
}
