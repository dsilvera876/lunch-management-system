import { shouldPersistDefaultOnLocationConfirm } from "@/lib/lunch-office-location-selection";

export type LateOrderSaveAsDefaultCheckboxState = {
  checked: boolean;
  disabled: boolean;
};

/** Stable save-as-default checkbox state below Delivery location in the late-order drawer. */
export function resolveLateOrderSaveAsDefaultCheckboxState(
  savedDefaultOfficeLocationId: string | null,
  selectedOfficeLocationId: string,
): LateOrderSaveAsDefaultCheckboxState {
  if (!selectedOfficeLocationId) {
    return { checked: false, disabled: true };
  }

  if (!savedDefaultOfficeLocationId) {
    return { checked: true, disabled: false };
  }

  if (selectedOfficeLocationId === savedDefaultOfficeLocationId) {
    return { checked: true, disabled: true };
  }

  return { checked: false, disabled: false };
}

/**
 * Updates save-as-default checkbox when the user picks a different delivery location.
 */
export function resolveLateOrderSaveAsDefaultOnLocationChange(
  savedDefaultOfficeLocationId: string | null,
  nextLocationId: string,
): boolean {
  return resolveLateOrderSaveAsDefaultCheckboxState(
    savedDefaultOfficeLocationId,
    nextLocationId,
  ).checked;
}

/** Whether submit should call set_my_default_office_location after the request is created. */
export function shouldSaveDefaultOnLateOrderSubmit(
  saveAsDefault: boolean,
  savedDefaultOfficeLocationId: string | null,
  officeLocationId: string,
): boolean {
  return shouldPersistDefaultOnLocationConfirm(
    saveAsDefault,
    savedDefaultOfficeLocationId,
    officeLocationId,
  );
}

export const LATE_ORDER_DEFAULT_SAVE_WARNING =
  "Your late order was submitted, but your default delivery location could not be saved. Update it from Preferences if needed.";

/** Office location id passed to eligibility RPC, or null when no usable saved default. */
export function resolveLateOrderEligibilityOfficeLocationId(
  savedDefaultOfficeLocationId: string | null,
  defaultOfficeLocationInactive: boolean,
): string | null {
  if (!savedDefaultOfficeLocationId || defaultOfficeLocationInactive) {
    return null;
  }

  return savedDefaultOfficeLocationId;
}

export function isInactiveLateOrderEligibilityError(message: string): boolean {
  return message.includes("Delivery location is invalid or inactive");
}
