import {
  calculateDraftSubtotal,
  draftToProviderPayload,
  emptyProviderDraft,
  validateProviderDraft,
  type ProviderDraft,
} from "@/lib/lunch-order-draft";
import { getCheckoutGlobalGuidanceMessage } from "@/lib/lunch-checkout-validation";
import { hasSelectedOrderItems, type ProviderOrderPayload } from "@/lib/order-payload";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { LunchCartEntry } from "@/lib/lunch-cart";

export type CheckoutProviderEntry = {
  providerId: string;
  providerName: string;
  draft: ProviderDraft;
  payload: ProviderOrderPayload;
  subtotal: number;
  validation: ReturnType<typeof validateProviderDraft>;
};

export type CheckoutValidation = {
  canSubmit: boolean;
  entries: CheckoutProviderEntry[];
  combinedSubtotal: number;
  guidanceMessage: string | null;
};

export function draftHasSelectedItems(draft: ProviderDraft): boolean {
  return hasSelectedOrderItems(draftToProviderPayload(draft));
}

function cartEntryToCheckoutEntry(
  entry: LunchCartEntry,
  menuItems: ProviderMenuBundle["menuItems"],
): CheckoutProviderEntry {
  const validation = validateProviderDraft(entry.draft);
  const payload = draftToProviderPayload(entry.draft);
  const subtotal = calculateDraftSubtotal(entry.draft, menuItems);

  return {
    providerId: entry.providerId,
    providerName: entry.providerName,
    draft: entry.draft,
    payload,
    subtotal,
    validation,
  };
}

export function validateLunchCart(
  providers: ProviderMenuBundle[],
  cart: LunchCartEntry[],
): CheckoutValidation {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const entries: CheckoutProviderEntry[] = [];

  for (const cartEntry of cart) {
    const provider = providersById.get(cartEntry.providerId);
    if (!provider) {
      continue;
    }

    entries.push(cartEntryToCheckoutEntry(cartEntry, provider.menuItems));
  }

  const guidanceMessage = getCheckoutGlobalGuidanceMessage(entries);
  const combinedSubtotal = entries.reduce((sum, entry) => sum + entry.subtotal, 0);
  const hasBlockingValidation = entries.some((entry) => !entry.validation.valid);
  const canSubmit = entries.length > 0 && guidanceMessage === null && !hasBlockingValidation;

  return {
    canSubmit,
    entries,
    combinedSubtotal,
    guidanceMessage,
  };
}

/** @deprecated Use validateLunchCart with explicit cart entries. */
export function validateLunchCheckout(
  providers: ProviderMenuBundle[],
  drafts: Record<string, ProviderDraft>,
): CheckoutValidation {
  const cart: LunchCartEntry[] = [];

  for (const provider of providers) {
    const draft = drafts[provider.id] ?? emptyProviderDraft();
    if (!draftHasSelectedItems(draft)) {
      continue;
    }

    cart.push({
      id: `legacy-${provider.id}`,
      providerId: provider.id,
      providerName: provider.name,
      draft,
    });
  }

  return validateLunchCart(providers, cart);
}

export type CheckoutRpcProviderOrder = {
  provider_id: string;
  items: ProviderOrderPayload;
  special_instructions: string | null;
};

export function collectDraftProviderMenuItemIds(draft: ProviderDraft): string[] {
  const ids: string[] = [];

  if (draft.mainId) {
    ids.push(draft.mainId);
  }

  ids.push(...draft.sideIds);

  for (const [itemId, quantity] of Object.entries(draft.standaloneQuantities)) {
    if (quantity > 0) {
      ids.push(itemId);
    }
  }

  return ids;
}

export function assertCheckoutDraftsMatchLoadedMenus(
  providers: ProviderMenuBundle[],
  entries: CheckoutProviderEntry[],
): { ok: true } | { ok: false; providerName: string; providerId: string } {
  const menuIdsByProvider = new Map(
    providers.map((provider) => [
      provider.id,
      new Set(provider.menuItems.map((item) => item.id)),
    ]),
  );

  for (const entry of entries) {
    const allowedIds = menuIdsByProvider.get(entry.providerId);
    if (!allowedIds) {
      return {
        ok: false,
        providerName: entry.providerName,
        providerId: entry.providerId,
      };
    }

    for (const itemId of collectDraftProviderMenuItemIds(entry.draft)) {
      if (!allowedIds.has(itemId)) {
        return {
          ok: false,
          providerName: entry.providerName,
          providerId: entry.providerId,
        };
      }
    }
  }

  return { ok: true };
}

export function buildCheckoutRpcPayload(
  entries: CheckoutProviderEntry[],
): CheckoutRpcProviderOrder[] {
  return entries.map((entry) => ({
    provider_id: entry.providerId,
    items: entry.payload,
    special_instructions: entry.draft.specialInstructions.trim().length > 0
      ? entry.draft.specialInstructions.trim()
      : null,
  }));
}

export function clearCheckoutDrafts(
  drafts: Record<string, ProviderDraft>,
  submittedProviderIds: string[],
): Record<string, ProviderDraft> {
  const next = { ...drafts };
  for (const providerId of submittedProviderIds) {
    next[providerId] = emptyProviderDraft();
  }
  return next;
}

export function clearAllCheckoutDrafts(
  providers: ProviderMenuBundle[],
  drafts: Record<string, ProviderDraft>,
): Record<string, ProviderDraft> {
  const next = { ...drafts };
  for (const provider of providers) {
    next[provider.id] = emptyProviderDraft();
  }
  return next;
}
