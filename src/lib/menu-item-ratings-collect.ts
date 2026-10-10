import type { MenuItemRatingSummary } from "@/lib/menu-item-ratings";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import type { GroupedCheckout } from "@/lib/staff-my-orders";
import { isProviderOrderEligibleForMenuItemRatingsUi } from "@/lib/menu-item-ratings-eligibility-ui";
import type { LoadMenuItemRatingSummariesResult } from "@/lib/menu-item-ratings";

export type MenuItemRatingSummariesById = Record<string, MenuItemRatingSummary>;

export function toRatingSummariesRecord(
  summaries: MenuItemRatingSummary[],
): MenuItemRatingSummariesById {
  return Object.fromEntries(
    summaries.map((summary) => [summary.providerMenuItemId, summary]),
  );
}

export function collectCatalogIdsFromProviderMenus(providers: ProviderMenuBundle[]): string[] {
  const ids = new Set<string>();

  for (const provider of providers) {
    if (!provider.ratingsEnabled) {
      continue;
    }
    for (const item of provider.menuItems) {
      ids.add(item.id);
    }
  }

  return [...ids];
}

export type MenuItemRatingsLoadState = {
  summariesById: MenuItemRatingSummariesById;
  loadFailed: boolean;
  loadErrorMessage: string | null;
};

export function menuItemRatingsFromLoadResult(
  result: LoadMenuItemRatingSummariesResult,
): MenuItemRatingsLoadState {
  if (!result.ok) {
    return {
      summariesById: {},
      loadFailed: true,
      loadErrorMessage: result.message,
    };
  }

  return {
    summariesById: toRatingSummariesRecord(result.summaries),
    loadFailed: false,
    loadErrorMessage: null,
  };
}

export function emptyMenuItemRatingsLoadState(): MenuItemRatingsLoadState {
  return {
    summariesById: {},
    loadFailed: false,
    loadErrorMessage: null,
  };
}

export function collectCatalogIdsFromDeliveredCheckouts(checkouts: GroupedCheckout[]): string[] {
  const ids = new Set<string>();

  for (const checkout of checkouts) {
    for (const order of checkout.providerOrders) {
      if (!order.ratingsEnabled || !isProviderOrderEligibleForMenuItemRatingsUi(order)) {
        continue;
      }

      for (const line of order.lines) {
        if (line.providerMenuItemId) {
          ids.add(line.providerMenuItemId);
        }
      }
    }
  }

  return [...ids];
}

export type RecentRateableMenuItem = {
  providerMenuItemId: string;
  itemName: string;
  deliveryDate: string;
};

export function collectRecentRateableMenuItems(
  checkouts: GroupedCheckout[],
  limit: number,
): RecentRateableMenuItem[] {
  const seen = new Set<string>();
  const result: RecentRateableMenuItem[] = [];
  const sorted = [...checkouts].sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  for (const checkout of sorted) {
    for (const order of checkout.providerOrders) {
      if (!order.ratingsEnabled || !isProviderOrderEligibleForMenuItemRatingsUi(order)) {
        continue;
      }

      for (const line of order.lines) {
        if (!line.providerMenuItemId || seen.has(line.providerMenuItemId)) {
          continue;
        }

        seen.add(line.providerMenuItemId);
        result.push({
          providerMenuItemId: line.providerMenuItemId,
          itemName: line.name,
          deliveryDate: checkout.deliveryDate,
        });

        if (result.length >= limit) {
          return result;
        }
      }
    }
  }

  return result;
}
