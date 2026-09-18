import { calculateMealBundleSubtotal, type ProviderOrderPayload } from "@/lib/order-payload";
import { calculateLineSubtotal } from "@/lib/ordering-ui";
import { validateOrderComposition } from "@/lib/menu-items";

export type ProviderDraft = {
  mainId: string | null;
  sideIds: string[];
  /** provider_menu_item_id -> quantity (0 omitted from map) */
  standaloneQuantities: Record<string, number>;
  mealQuantity: number;
  specialInstructions: string;
};

export const DEFAULT_MEAL_QUANTITY = 1;

export function emptyProviderDraft(): ProviderDraft {
  return {
    mainId: null,
    sideIds: [],
    standaloneQuantities: {},
    mealQuantity: DEFAULT_MEAL_QUANTITY,
    specialInstructions: "",
  };
}

export function draftToProviderPayload(draft: ProviderDraft): ProviderOrderPayload {
  const mealComplete = draft.mainId !== null && draft.sideIds.length > 0;

  return {
    meal_quantity: mealComplete ? draft.mealQuantity : null,
    main_provider_menu_item_id: draft.mainId,
    side_provider_menu_item_ids: [...draft.sideIds],
    standalone_items: Object.entries(draft.standaloneQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([provider_menu_item_id, quantity]) => ({
        provider_menu_item_id,
        quantity,
      })),
  };
}

type PricedItem = {
  id: string;
  price: number;
};

export function calculateDraftSubtotal(
  draft: ProviderDraft,
  menuItems: PricedItem[],
): number {
  const priceById = new Map(menuItems.map((item) => [item.id, item.price]));
  let total = 0;

  if (draft.mainId && draft.sideIds.length > 0) {
    const mainPrice = priceById.get(draft.mainId) ?? 0;
    const sidePrices = draft.sideIds.map((id) => priceById.get(id) ?? 0);
    total += calculateMealBundleSubtotal(draft.mealQuantity, [mainPrice, ...sidePrices]);
  }

  for (const [itemId, quantity] of Object.entries(draft.standaloneQuantities)) {
    if (quantity > 0) {
      total += calculateLineSubtotal(priceById.get(itemId) ?? 0, quantity);
    }
  }

  return total;
}

export function getStandaloneQuantity(draft: ProviderDraft, itemId: string): number {
  return draft.standaloneQuantities[itemId] ?? 0;
}

export function isStandaloneInDraft(draft: ProviderDraft, itemId: string): boolean {
  return getStandaloneQuantity(draft, itemId) > 0;
}

export function validateProviderDraft(draft: ProviderDraft): {
  valid: boolean;
  message: string | null;
  mealIncomplete: boolean;
} {
  const standaloneQuantities = Object.values(draft.standaloneQuantities).filter(
    (qty) => qty > 0,
  );

  const mealComplete = draft.mainId !== null && draft.sideIds.length > 0;
  const mealIncomplete = draft.mainId !== null && draft.sideIds.length === 0;

  const composition = validateOrderComposition({
    mainSelected: draft.mainId !== null,
    sideCount: draft.sideIds.length,
    mealQuantity: mealComplete ? draft.mealQuantity : 0,
    standaloneQuantities,
  });

  if (mealIncomplete) {
    return {
      valid: false,
      message: "Choose at least one side to complete this meal.",
      mealIncomplete: true,
    };
  }

  if (!composition.valid) {
    return {
      valid: false,
      message: composition.message,
      mealIncomplete: false,
    };
  }

  return { valid: true, message: null, mealIncomplete: false };
}

export function replaceMain(draft: ProviderDraft, mainId: string): ProviderDraft {
  return {
    ...draft,
    mainId,
  };
}

export function removeMain(draft: ProviderDraft): ProviderDraft {
  return {
    ...draft,
    mainId: null,
    sideIds: [],
    mealQuantity: DEFAULT_MEAL_QUANTITY,
  };
}

export function removeSide(draft: ProviderDraft, sideId: string): ProviderDraft {
  return {
    ...draft,
    sideIds: draft.sideIds.filter((id) => id !== sideId),
  };
}

export function addSide(draft: ProviderDraft, sideId: string): ProviderDraft {
  if (draft.sideIds.includes(sideId)) {
    return draft;
  }

  return {
    ...draft,
    sideIds: [...draft.sideIds, sideId],
  };
}

export function addStandalone(draft: ProviderDraft, itemId: string): ProviderDraft {
  const current = draft.standaloneQuantities[itemId] ?? 0;

  return {
    ...draft,
    standaloneQuantities: {
      ...draft.standaloneQuantities,
      [itemId]: current > 0 ? current : 1,
    },
  };
}

export function setStandaloneQuantity(
  draft: ProviderDraft,
  itemId: string,
  quantity: number,
): ProviderDraft {
  const next = { ...draft.standaloneQuantities };
  const clamped = Math.max(0, Math.floor(quantity));

  if (clamped === 0) {
    delete next[itemId];
  } else {
    next[itemId] = clamped;
  }

  return {
    ...draft,
    standaloneQuantities: next,
  };
}

export function removeStandalone(draft: ProviderDraft, itemId: string): ProviderDraft {
  return setStandaloneQuantity(draft, itemId, 0);
}
