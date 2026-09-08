export type ProviderOrderPayload = {
  meal_quantity: number | null;
  main_provider_menu_item_id: string | null;
  side_provider_menu_item_ids: string[];
  standalone_items: Array<{
    provider_menu_item_id: string;
    quantity: number;
  }>;
};

export type SnapshotOrderPayload = {
  meal_quantity: number | null;
  main_menu_item_id: string | null;
  side_menu_item_ids: string[];
  standalone_items: Array<{
    menu_item_id: string;
    quantity: number;
  }>;
};

function parseStandaloneQuantities(
  formData: FormData,
  prefix: string,
): Array<{ id: string; quantity: number }> {
  const items: Array<{ id: string; quantity: number }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(`${prefix}:`) || typeof value !== "string") {
      continue;
    }

    const id = key.slice(`${prefix}:`.length);
    const quantity = Number(value);

    if (Number.isInteger(quantity) && quantity > 0) {
      items.push({ id, quantity });
    }
  }

  return items;
}

function parseSelectedSideIds(
  formData: FormData,
  prefix: string,
): string[] {
  const ids: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(`${prefix}:`) || value !== "on") {
      continue;
    }

    ids.push(key.slice(`${prefix}:`.length));
  }

  return ids;
}

export function buildProviderOrderPayload(formData: FormData): ProviderOrderPayload {
  const mainField = formData.get("mainProviderMenuItemId");
  const mealQuantityRaw = formData.get("mealQuantity");
  const standaloneItems = parseStandaloneQuantities(formData, "provider-quantity");
  const sideIds = parseSelectedSideIds(formData, "side");

  const mainId = typeof mainField === "string" && mainField.length > 0
    ? mainField
    : null;

  let mealQuantity: number | null = null;

  if (typeof mealQuantityRaw === "string" && mealQuantityRaw.length > 0) {
    const parsed = Number(mealQuantityRaw);
    if (Number.isInteger(parsed) && parsed > 0) {
      mealQuantity = parsed;
    }
  }

  return {
    meal_quantity: mealQuantity,
    main_provider_menu_item_id: mainId,
    side_provider_menu_item_ids: sideIds,
    standalone_items: standaloneItems.map((item) => ({
      provider_menu_item_id: item.id,
      quantity: item.quantity,
    })),
  };
}

export function buildSnapshotOrderPayload(formData: FormData): SnapshotOrderPayload {
  const mainField = formData.get("mainMenuItemId");
  const mealQuantityRaw = formData.get("mealQuantity");
  const standaloneItems = parseStandaloneQuantities(formData, "quantity");
  const sideIds = parseSelectedSideIds(formData, "side");

  const mainId = typeof mainField === "string" && mainField.length > 0
    ? mainField
    : null;

  let mealQuantity: number | null = null;

  if (typeof mealQuantityRaw === "string" && mealQuantityRaw.length > 0) {
    const parsed = Number(mealQuantityRaw);
    if (Number.isInteger(parsed) && parsed > 0) {
      mealQuantity = parsed;
    }
  }

  return {
    meal_quantity: mealQuantity,
    main_menu_item_id: mainId,
    side_menu_item_ids: sideIds,
    standalone_items: standaloneItems.map((item) => ({
      menu_item_id: item.id,
      quantity: item.quantity,
    })),
  };
}

export function hasSelectedOrderItems(payload: ProviderOrderPayload | SnapshotOrderPayload): boolean {
  const hasMain =
    ("main_provider_menu_item_id" in payload && payload.main_provider_menu_item_id !== null) ||
    ("main_menu_item_id" in payload && payload.main_menu_item_id !== null);
  const sideCount =
    "side_provider_menu_item_ids" in payload
      ? payload.side_provider_menu_item_ids.length
      : payload.side_menu_item_ids.length;

  return hasMain || sideCount > 0 || payload.standalone_items.length > 0;
}

export function formatMealBundleLabel(mealQuantity: number): string {
  return `Meal ×${mealQuantity}`;
}

export function calculateMealBundleSubtotal(
  mealQuantity: number,
  componentPrices: number[],
): number {
  const unitTotal = componentPrices.reduce((sum, price) => sum + price, 0);
  return mealQuantity * unitTotal;
}
