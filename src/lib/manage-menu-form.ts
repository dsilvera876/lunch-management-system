export const MANAGE_MENU_SUCCESS_TOAST_DURATION_MS = 4500;

export const MANAGE_MENU_TOAST = {
  created: "Menu item created.",
  updated: "Menu item updated.",
  activated: "Menu item activated.",
  deactivated: "Menu item deactivated.",
  deleted: "Menu item deleted.",
} as const;

export const ITEM_TYPE_FIELD_HINTS = {
  main: "Primary meal item.",
  side: "Included with a main.",
  standalone: "Can be ordered separately.",
} as const;

export function manageMenuFlashToastTitle(
  flash: "menuCreated" | "menuUpdated" | "menuToggled",
): string {
  switch (flash) {
    case "menuCreated":
      return MANAGE_MENU_TOAST.created;
    case "menuUpdated":
      return MANAGE_MENU_TOAST.updated;
    default:
      return MANAGE_MENU_TOAST.updated;
  }
}
