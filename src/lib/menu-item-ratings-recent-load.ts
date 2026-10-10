import { createClient } from "@/lib/supabase/server";
import { getRelated } from "@/lib/format";
import { isProviderOrderEligibleForMenuItemRatingsUi } from "@/lib/menu-item-ratings-eligibility-ui";
import type { RecentRateableMenuItem } from "@/lib/menu-item-ratings-collect";
import type { DeliveryState } from "@/lib/delivery-reconciliation";
import { MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE } from "@/lib/menu-item-ratings";

export type RecentRateableMenuItemsLoadResult =
  | { ok: true; items: RecentRateableMenuItem[] }
  | { ok: false; message: string };

type RecentOrderRow = {
  created_at: string;
  status: string;
  delivery_state: string;
  lunch_days:
    | {
        lunch_date: string;
        lunch_providers:
          | { ratings_enabled: boolean | null }
          | { ratings_enabled: boolean | null }[];
      }
    | {
        lunch_date: string;
        lunch_providers:
          | { ratings_enabled: boolean | null }
          | { ratings_enabled: boolean | null }[];
      }[];
  order_items: Array<{
    menu_items:
      | {
          name: string;
          provider_menu_item_id: string | null;
        }
      | {
          name: string;
          provider_menu_item_id: string | null;
        }[];
  }>;
};

/**
 * Loads up to {@link limit} distinct catalog menu items from the caller's recent
 * qualifying orders — without loading full My Orders checkout history.
 */
export async function loadRecentRateableMenuItemsForHome(
  profileId: string,
  limit: number,
): Promise<RecentRateableMenuItemsLoadResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      created_at,
      status,
      delivery_state,
      lunch_days (
        lunch_date,
        lunch_providers (
          ratings_enabled
        )
      ),
      order_items (
        menu_items (
          name,
          provider_menu_item_id
        )
      )
    `)
    .eq("profile_id", profileId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error || !data) {
    return { ok: false, message: MENU_ITEM_RATINGS_LOAD_ERROR_MESSAGE };
  }

  const seen = new Set<string>();
  const result: RecentRateableMenuItem[] = [];

  for (const row of data as RecentOrderRow[]) {
    const lunchDay = getRelated(row.lunch_days);
    const provider = lunchDay ? getRelated(lunchDay.lunch_providers) : null;

    if (provider?.ratings_enabled !== true) {
      continue;
    }

    if (
      !isProviderOrderEligibleForMenuItemRatingsUi({
        status: row.status,
        deliveryState: row.delivery_state as DeliveryState,
      })
    ) {
      continue;
    }

    const deliveryDate = lunchDay?.lunch_date;
    if (!deliveryDate) {
      continue;
    }

    for (const item of row.order_items ?? []) {
      const menuItem = getRelated(item.menu_items);
      const catalogId = menuItem?.provider_menu_item_id;
      if (!catalogId || seen.has(catalogId)) {
        continue;
      }

      seen.add(catalogId);
      result.push({
        providerMenuItemId: catalogId,
        itemName: menuItem.name ?? "Menu item",
        deliveryDate,
      });

      if (result.length >= limit) {
        return { ok: true, items: result };
      }
    }
  }

  return { ok: true, items: result };
}
