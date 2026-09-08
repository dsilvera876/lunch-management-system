export type MenuItemType = "main" | "side" | "standalone";

export const MENU_ITEM_TYPES: ReadonlyArray<{
  value: MenuItemType;
  label: string;
  description: string;
}> = [
  {
    value: "main",
    label: "Main",
    description: "Primary meal item. Requires at least one side in the same order.",
  },
  {
    value: "side",
    label: "Side",
    description: "Side item that must be ordered with exactly one main.",
  },
  {
    value: "standalone",
    label: "Standalone",
    description: "Can be ordered alone or added to a meal order.",
  },
] as const;

export const DEFAULT_UNIT_LABEL = "Each";

export type OrderLineInput = {
  itemType: MenuItemType;
  quantity: number;
};

export type OrderCompositionInput = {
  mainSelected: boolean;
  sideCount: number;
  mealQuantity: number;
  standaloneQuantities: number[];
};

export type OrderCompositionResult =
  | { valid: true }
  | { valid: false; message: string };

export function validateOrderComposition(
  input: OrderCompositionInput,
): OrderCompositionResult {
  const standaloneSelected = input.standaloneQuantities.filter((qty) => qty > 0);
  const hasMealSelection = input.mainSelected || input.sideCount > 0;

  if (!hasMealSelection && standaloneSelected.length === 0) {
    return { valid: false, message: "Select at least one item with quantity 1 or more." };
  }

  if (hasMealSelection) {
    if (!input.mainSelected) {
      return {
        valid: false,
        message: "Side items require a main item in the same order.",
      };
    }

    if (input.sideCount === 0) {
      return {
        valid: false,
        message: "A main item requires at least one side item.",
      };
    }

    if (!Number.isInteger(input.mealQuantity) || input.mealQuantity <= 0) {
      return {
        valid: false,
        message: "Meal quantity must be 1 or more.",
      };
    }
  } else if (input.mealQuantity > 0) {
    return {
      valid: false,
      message: "Standalone-only orders cannot include meal quantity.",
    };
  }

  if (standaloneSelected.some((qty) => !Number.isInteger(qty) || qty <= 0)) {
    return {
      valid: false,
      message: "Standalone item quantities must be 1 or more.",
    };
  }

  return { valid: true };
}

export function getMenuItemTypeLabel(itemType: MenuItemType): string {
  return MENU_ITEM_TYPES.find((type) => type.value === itemType)?.label ?? itemType;
}

export function formatMenuItemLabel(
  name: string,
  unitLabel: string | null | undefined,
): string {
  if (!unitLabel || unitLabel === DEFAULT_UNIT_LABEL) {
    return name;
  }

  return `${name} (${unitLabel})`;
}

export function formatOrderLineLabel(
  name: string,
  unitLabel: string | null | undefined,
  quantity: number,
): string {
  return `${formatMenuItemLabel(name, unitLabel)} × ${quantity}`;
}

export function groupMenuItemsByType<T extends { itemType: MenuItemType }>(
  items: T[],
): Record<MenuItemType, T[]> {
  return {
    main: items.filter((item) => item.itemType === "main"),
    side: items.filter((item) => item.itemType === "side"),
    standalone: items.filter((item) => item.itemType === "standalone"),
  };
}

export function providerOffersMeals(items: Array<{ itemType: MenuItemType }>): boolean {
  return items.some((item) => item.itemType === "main" || item.itemType === "side");
}

export function normalizeSpecialInstructions(value: string): string {
  return value.trim();
}

export function isValidSpecialInstructions(value: string): boolean {
  const trimmed = normalizeSpecialInstructions(value);
  return trimmed.length <= 500;
}
