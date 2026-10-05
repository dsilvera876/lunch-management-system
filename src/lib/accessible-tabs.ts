export const LUNCH_PROVIDER_MENU_TABPANEL_ID = "lunch-provider-menu-tabpanel";
export const MY_ORDERS_TABPANEL_ID = "my-orders-tabpanel";

export const SELECT_MAIN_BEFORE_SIDE_MESSAGE = "Select a main item first.";

export type TabKeyboardAction = "next" | "previous" | "first" | "last";

export function rovingTabIndex(isSelected: boolean): 0 | -1 {
  return isSelected ? 0 : -1;
}

export function resolveTabKeyboardAction(key: string): TabKeyboardAction | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
      return "previous";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

export function resolveNextTabIndex(
  currentIndex: number,
  tabCount: number,
  action: TabKeyboardAction,
): number {
  if (tabCount <= 0) {
    return 0;
  }

  switch (action) {
    case "first":
      return 0;
    case "last":
      return tabCount - 1;
    case "next":
      return (currentIndex + 1) % tabCount;
    case "previous":
      return (currentIndex - 1 + tabCount) % tabCount;
    default:
      return currentIndex;
  }
}
