import {
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  type MenuItemType,
} from "@/lib/menu-items";

type Item = {
  itemType: MenuItemType;
  displayCategory?: string | null;
};

export function summarizeMenuCounts(items: Item[]): string[] {
  const grouped = groupMenuItemsByType(items);
  const badges: string[] = [];

  if (grouped.main.length > 0) {
    badges.push(`Mains ${grouped.main.length}`);
  }

  if (grouped.side.length > 0) {
    badges.push(`Sides ${grouped.side.length}`);
  }

  const standaloneGrouped = groupStandaloneItemsByCategory(grouped.standalone);

  for (const [category, categoryItems] of Object.entries(standaloneGrouped)) {
    badges.push(`${category} ${categoryItems.length}`);
  }

  return badges;
}
