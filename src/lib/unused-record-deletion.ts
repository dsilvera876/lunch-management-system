export const PROVIDER_IN_USE_DELETION_MESSAGE =
  "This provider has existing menu or order history and cannot be deleted. Deactivate it instead.";

export const OFFICE_LOCATION_IN_USE_DELETION_MESSAGE =
  "This office location is already in use and cannot be deleted. Deactivate it instead.";

export const PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE =
  "This item has been used in menus or orders and cannot be permanently deleted. Deactivate it instead.";

export function isProviderInUseDeletionError(message: string): boolean {
  return message.includes(PROVIDER_IN_USE_DELETION_MESSAGE);
}

export function isOfficeLocationInUseDeletionError(message: string): boolean {
  return message.includes(OFFICE_LOCATION_IN_USE_DELETION_MESSAGE);
}

export function isProviderMenuItemInUseDeletionError(message: string): boolean {
  return message.includes(PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE);
}
