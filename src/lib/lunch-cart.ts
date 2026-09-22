import {
  draftToProviderPayload,
  emptyProviderDraft,
  validateProviderDraft,
  type ProviderDraft,
} from "@/lib/lunch-order-draft";
import { hasSelectedOrderItems } from "@/lib/order-payload";
import { isValidSpecialInstructions } from "@/lib/menu-items";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";

export type LunchCartEntry = {
  id: string;
  providerId: string;
  providerName: string;
  draft: ProviderDraft;
};

export function createLunchCartEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function snapshotDraftForCart(draft: ProviderDraft): ProviderDraft {
  return {
    mainId: draft.mainId,
    sideIds: [...draft.sideIds],
    standaloneQuantities: { ...draft.standaloneQuantities },
    mealQuantity: draft.mealQuantity,
    specialInstructions: draft.specialInstructions,
  };
}

export function createCartEntryFromDraft(
  provider: Pick<ProviderMenuBundle, "id" | "name">,
  draft: ProviderDraft,
): LunchCartEntry {
  return {
    id: createLunchCartEntryId(),
    providerId: provider.id,
    providerName: provider.name,
    draft: snapshotDraftForCart(draft),
  };
}

function draftHasSelectedItems(draft: ProviderDraft): boolean {
  return hasSelectedOrderItems(draftToProviderPayload(draft));
}

export function canAddDraftToCart(draft: ProviderDraft): boolean {
  if (!draftHasSelectedItems(draft)) {
    return false;
  }

  const validation = validateProviderDraft(draft);
  if (!validation.valid) {
    return false;
  }

  return isValidSpecialInstructions(draft.specialInstructions);
}

export type UnfinishedWorkingDraft = {
  providerId: string;
  providerName: string;
};

export function findUnfinishedWorkingDrafts(
  providers: ProviderMenuBundle[],
  drafts: Record<string, ProviderDraft>,
): UnfinishedWorkingDraft[] {
  const unfinished: UnfinishedWorkingDraft[] = [];

  for (const provider of providers) {
    const draft = drafts[provider.id] ?? emptyProviderDraft();
    if (draftHasSelectedItems(draft)) {
      unfinished.push({
        providerId: provider.id,
        providerName: provider.name,
      });
    }
  }

  return unfinished;
}

export function formatUnfinishedDraftMessage(
  unfinished: UnfinishedWorkingDraft[],
): string {
  if (unfinished.length === 0) {
    return "Finish or clear your in-progress order before placing your checkout.";
  }

  if (unfinished.length === 1) {
    return `Finish the in-progress order for ${unfinished[0]!.providerName} before placing your checkout.`;
  }

  const names = unfinished.map((entry) => entry.providerName).join(", ");
  return `Finish the in-progress orders for ${names} before placing your checkout.`;
}

export type InProgressDraftDisplay = {
  providerId: string;
  providerName: string;
  providerOrderIndex: number;
  draft: ProviderDraft;
};

export type ProviderCartSection = {
  providerId: string;
  providerName: string;
  completedEntries: Array<LunchCartEntry & { providerOrderIndex: number }>;
  inProgress: InProgressDraftDisplay | null;
};

export function listInProgressDrafts(
  providers: ProviderMenuBundle[],
  drafts: Record<string, ProviderDraft>,
  cart: LunchCartEntry[],
): InProgressDraftDisplay[] {
  const completedCountByProvider = new Map<string, number>();
  for (const entry of cart) {
    completedCountByProvider.set(
      entry.providerId,
      (completedCountByProvider.get(entry.providerId) ?? 0) + 1,
    );
  }

  const inProgress: InProgressDraftDisplay[] = [];

  for (const provider of providers) {
    const draft = drafts[provider.id] ?? emptyProviderDraft();
    if (!draftHasSelectedItems(draft)) {
      continue;
    }

    inProgress.push({
      providerId: provider.id,
      providerName: provider.name,
      providerOrderIndex: (completedCountByProvider.get(provider.id) ?? 0) + 1,
      draft,
    });
  }

  return inProgress;
}

export function buildProviderCartSections(
  providers: ProviderMenuBundle[],
  cart: LunchCartEntry[],
  drafts: Record<string, ProviderDraft>,
): ProviderCartSection[] {
  const grouped = groupCartEntriesForDisplay(cart);
  const groupById = new Map(grouped.map((group) => [group.providerId, group]));
  const inProgressList = listInProgressDrafts(providers, drafts, cart);
  const inProgressById = new Map(
    inProgressList.map((entry) => [entry.providerId, entry]),
  );

  const sections: ProviderCartSection[] = [];

  for (const provider of providers) {
    const group = groupById.get(provider.id);
    const inProgress = inProgressById.get(provider.id) ?? null;
    const completedEntries = group?.entries ?? [];

    if (completedEntries.length === 0 && !inProgress) {
      continue;
    }

    sections.push({
      providerId: provider.id,
      providerName: provider.name,
      completedEntries,
      inProgress,
    });
  }

  return sections;
}

export function hasVisibleCartContent(
  cart: LunchCartEntry[],
  drafts: Record<string, ProviderDraft>,
  providers: ProviderMenuBundle[],
): boolean {
  if (cart.length > 0) {
    return true;
  }

  return listInProgressDrafts(providers, drafts, cart).length > 0;
}

export function countDistinctProviders(cart: LunchCartEntry[]): number {
  return new Set(cart.map((entry) => entry.providerId)).size;
}

export function groupCartEntriesForDisplay(cart: LunchCartEntry[]): Array<{
  providerId: string;
  providerName: string;
  entries: Array<LunchCartEntry & { providerOrderIndex: number }>;
}> {
  const groups = new Map<
    string,
    { providerName: string; entries: Array<LunchCartEntry & { providerOrderIndex: number }> }
  >();
  const orderIndexByProvider = new Map<string, number>();

  for (const entry of cart) {
    const nextIndex = (orderIndexByProvider.get(entry.providerId) ?? 0) + 1;
    orderIndexByProvider.set(entry.providerId, nextIndex);

    const group = groups.get(entry.providerId) ?? {
      providerName: entry.providerName,
      entries: [],
    };

    group.entries.push({ ...entry, providerOrderIndex: nextIndex });
    groups.set(entry.providerId, group);
  }

  return Array.from(groups.entries()).map(([providerId, group]) => ({
    providerId,
    providerName: group.providerName,
    entries: group.entries,
  }));
}
