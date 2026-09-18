import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuItemType } from "@/lib/menu-items";
import type { Weekday } from "@/lib/datetime";

export type ProviderMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory: string | null;
};

export type ProviderMenuBundle = {
  id: string;
  name: string;
  description: string | null;
  menuItems: ProviderMenuItem[];
};

type SnapshotMenuItem = {
  id: string;
  provider_menu_item_id: string | null;
  name: string;
  description: string | null;
  price: number | string;
  item_type: string;
  unit_label: string;
  display_category: string | null;
  is_active: boolean;
};

export async function loadProviderMenusForOrderDate(
  supabase: SupabaseClient,
  orderDate: string,
  orderWeekday: Weekday,
): Promise<ProviderMenuBundle[]> {
  const { data: providers, error } = await supabase
    .from("lunch_providers")
    .select(`
      id,
      name,
      description,
      provider_menu_items (
        id,
        name,
        description,
        price,
        item_type,
        unit_label,
        display_category,
        active,
        provider_menu_item_weekdays (
          weekday
        )
      )
    `)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error || !providers) {
    return [];
  }

  const { data: lunchDays } = await supabase
    .from("lunch_days")
    .select(`
      provider_id,
      menu_items (
        id,
        provider_menu_item_id,
        name,
        description,
        price,
        item_type,
        unit_label,
        display_category,
        is_active
      )
    `)
    .eq("order_date", orderDate)
    .not("provider_id", "is", null);

  const snapshotByProvider = new Map<string, SnapshotMenuItem[]>();

  for (const day of lunchDays ?? []) {
    if (!day.provider_id) {
      continue;
    }

    const items = (day.menu_items ?? []).filter(
      (item: SnapshotMenuItem) => item.is_active,
    ) as SnapshotMenuItem[];

    if (items.length > 0) {
      snapshotByProvider.set(day.provider_id, items);
    }
  }

  return providers
    .map((provider) => {
      const snapshotItems = snapshotByProvider.get(provider.id);

      const menuItems = snapshotItems?.length
        ? snapshotItems.map((item) => ({
            id: item.provider_menu_item_id ?? item.id,
            name: item.name,
            description: item.description,
            price: Number(item.price),
            itemType: item.item_type as MenuItemType,
            unitLabel: item.unit_label,
            displayCategory: item.display_category,
          }))
        : provider.provider_menu_items
            .filter(
              (item) =>
                item.active &&
                item.provider_menu_item_weekdays.some(
                  (day) => day.weekday === orderWeekday,
                ),
            )
            .map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              price: Number(item.price),
              itemType: item.item_type as MenuItemType,
              unitLabel: item.unit_label,
              displayCategory: item.display_category,
            }));

      if (menuItems.length === 0) {
        return null;
      }

      return {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        menuItems,
      };
    })
    .filter((provider): provider is ProviderMenuBundle => provider !== null);
}
