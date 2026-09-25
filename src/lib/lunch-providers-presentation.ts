import { WEEKDAYS, type Weekday } from "@/lib/datetime";
import {
  formatDisplayCategoryCount,
  getMenuItemTypeLabel,
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  normalizeDisplayCategory,
  type MenuItemType,
} from "@/lib/menu-items";

export type ProviderMenuCountSource = {
  item_type: string;
  active: boolean;
  display_category: string | null;
};

export type ManageMenuItemRecord = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory: string | null;
  active: boolean;
  weekdays: number[];
};

export type ProviderMenuMetric = {
  value: number;
  label: string;
};

export function buildProviderMenuMetrics(
  items: ProviderMenuCountSource[],
): ProviderMenuMetric[] {
  const activeItems = items.filter((item) => item.active);
  const metrics: ProviderMenuMetric[] = [];

  const mainCount = activeItems.filter((item) => item.item_type === "main").length;
  const sideCount = activeItems.filter((item) => item.item_type === "side").length;

  if (mainCount > 0) {
    metrics.push({
      value: mainCount,
      label: mainCount === 1 ? "Main" : "Mains",
    });
  }

  if (sideCount > 0) {
    metrics.push({
      value: sideCount,
      label: sideCount === 1 ? "Side" : "Sides",
    });
  }

  const standaloneItems = activeItems.filter((item) => item.item_type === "standalone");
  const categorizedCounts: Record<string, number> = {};
  let uncategorizedStandaloneCount = 0;

  for (const item of standaloneItems) {
    const category = normalizeDisplayCategory(item.display_category);
    if (category) {
      categorizedCounts[category] = (categorizedCounts[category] ?? 0) + 1;
      continue;
    }

    uncategorizedStandaloneCount += 1;
  }

  for (const [category, count] of Object.entries(categorizedCounts).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const label = formatDisplayCategoryCount(category, count).replace(/^\d+\s+/, "");
    metrics.push({ value: count, label });
  }

  if (uncategorizedStandaloneCount > 0) {
    metrics.push({
      value: uncategorizedStandaloneCount,
      label: "Standalone",
    });
  }

  return metrics;
}

export function buildProviderMenuCountParts(
  items: ProviderMenuCountSource[],
): string[] {
  return buildProviderMenuMetrics(items).map(
    (metric) => `${metric.value} ${metric.label}`,
  );
}

export function formatProviderMenuCountsLine(parts: string[]): string {
  return parts.join(" · ");
}

export function formatLateOrdersOverviewLabel(acceptsLateOrders: boolean): string {
  return acceptsLateOrders ? "Enabled" : "Disabled";
}

export function menuItemAvailableOnWeekday(
  item: Pick<ManageMenuItemRecord, "weekdays">,
  weekday: Weekday,
): boolean {
  return item.weekdays.includes(weekday);
}

export function filterMenuItemsForWeekday<T extends Pick<ManageMenuItemRecord, "weekdays">>(
  items: T[],
  weekday: Weekday,
): T[] {
  return items.filter((item) => menuItemAvailableOnWeekday(item, weekday));
}

/** Weekday comparison tabs: active items configured for that order day only. */
export function filterActiveMenuItemsForWeekday<
  T extends Pick<ManageMenuItemRecord, "weekdays" | "active">,
>(items: T[], weekday: Weekday): T[] {
  return items.filter(
    (item) => item.active && menuItemAvailableOnWeekday(item, weekday),
  );
}

export type ManageMenuSection = {
  key: string;
  label: string;
  items: ManageMenuItemRecord[];
};

export const MANAGE_MENU_ALL_DAYS = "all" as const;

export type ManageMenuView = typeof MANAGE_MENU_ALL_DAYS | Weekday;

export function isManageMenuAllDaysView(
  view: ManageMenuView,
): view is typeof MANAGE_MENU_ALL_DAYS {
  return view === MANAGE_MENU_ALL_DAYS;
}

export function getManageMenuViewContext(view: ManageMenuView): {
  title: string;
  description: string;
} {
  if (isManageMenuAllDaysView(view)) {
    return {
      title: "Viewing complete menu",
      description: "Showing all recurring menu items for this provider.",
    };
  }

  const weekdayLabel = getManageMenuWeekdayLabel(view);
  return {
    title: `Viewing ${weekdayLabel} menu`,
    description: `Showing active menu items available on ${weekdayLabel}.`,
  };
}

export function buildManageMenuSections(items: ManageMenuItemRecord[]): ManageMenuSection[] {
  const grouped = groupMenuItemsByType(items);
  const standaloneGrouped = groupStandaloneItemsByCategory(
    grouped.standalone.map((item) => ({
      ...item,
      displayCategory: item.displayCategory,
    })),
  );

  const sortItems = (a: ManageMenuItemRecord, b: ManageMenuItemRecord) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  };

  const sections: ManageMenuSection[] = [];

  if (grouped.main.length > 0) {
    sections.push({
      key: "main",
      label: "Mains",
      items: [...grouped.main].sort(sortItems),
    });
  }

  if (grouped.side.length > 0) {
    sections.push({
      key: "side",
      label: "Sides",
      items: [...grouped.side].sort(sortItems),
    });
  }

  for (const [category, catItems] of Object.entries(standaloneGrouped).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    sections.push({
      key: `standalone-${category}`,
      label: category,
      items: [...catItems].sort(sortItems),
    });
  }

  return sections;
}

export function buildManageMenuSectionsForView(
  items: ManageMenuItemRecord[],
  view: ManageMenuView,
): ManageMenuSection[] {
  const scoped = isManageMenuAllDaysView(view)
    ? items
    : filterActiveMenuItemsForWeekday(items, view);

  return buildManageMenuSections(scoped);
}

export function buildManageMenuSectionsForWeekday(
  items: ManageMenuItemRecord[],
  weekday: Weekday,
): ManageMenuSection[] {
  return buildManageMenuSectionsForView(items, weekday);
}

export function removeManageMenuItem(
  items: ManageMenuItemRecord[],
  menuItemId: string,
): ManageMenuItemRecord[] {
  return items.filter((item) => item.id !== menuItemId);
}

export function mergeManageMenuItem(
  items: ManageMenuItemRecord[],
  item: ManageMenuItemRecord,
): ManageMenuItemRecord[] {
  const without = items.filter((row) => row.id !== item.id);
  return [...without, item].sort((a, b) => a.name.localeCompare(b.name));
}

export function getManageMenuWeekdayLabel(weekday: Weekday): string {
  return WEEKDAYS.find((day) => day.value === weekday)?.label ?? "Monday";
}

export function formatManageMenuItemTypeLabel(itemType: MenuItemType): string {
  return getMenuItemTypeLabel(itemType);
}

export const MANAGE_MENU_WEEKDAYS = WEEKDAYS;

export function collectActiveProviderWeekdays(
  items: Array<{ active: boolean; weekdays: number[] }>,
): Weekday[] {
  const weekdays = new Set<number>();

  for (const item of items) {
    if (!item.active) {
      continue;
    }

    for (const weekday of item.weekdays) {
      if (weekday >= 1 && weekday <= 5) {
        weekdays.add(weekday);
      }
    }
  }

  return [...weekdays].sort((a, b) => a - b) as Weekday[];
}
