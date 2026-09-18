"use client";

import { Card } from "@/components/ui/card";
import { MenuItemRow } from "@/components/lunch/menu-item-row";
import { summarizeMenuCounts } from "@/lib/lunch-menu-counts";
import { isStandaloneInDraft, type ProviderDraft } from "@/lib/lunch-order-draft";
import {
  getMenuItemTypeLabel,
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  type MenuItemType,
} from "@/lib/menu-items";

export type MenuItemView = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory: string | null;
};

type Props = {
  providerId: string;
  providerName: string;
  providerDescription: string | null;
  menuItems: MenuItemView[];
  draft: ProviderDraft;
  disabled?: boolean;
  onSelectMain: (itemId: string) => void;
  onRemoveMain: () => void;
  onAddSide: (itemId: string) => void;
  onRemoveSide: (itemId: string) => void;
  onAddStandalone: (itemId: string) => void;
  onRemoveStandalone: (itemId: string) => void;
};

export function ProviderMenuPanel({
  providerId,
  providerName,
  providerDescription,
  menuItems,
  draft,
  disabled = false,
  onSelectMain,
  onRemoveMain,
  onAddSide,
  onRemoveSide,
  onAddStandalone,
  onRemoveStandalone,
}: Props) {
  const grouped = groupMenuItemsByType(menuItems);
  const standaloneGrouped = groupStandaloneItemsByCategory(grouped.standalone);
  const countBadges = summarizeMenuCounts(menuItems);

  return (
    <div
      role="tabpanel"
      id={`provider-panel-${providerId}`}
      aria-labelledby={`provider-tab-${providerId}`}
      className="min-w-0"
    >
      <Card padding="md">
        <div className="border-b border-border pb-4">
          <h2 className="text-xl font-semibold text-slate-900">{providerName}</h2>
          {providerDescription ? (
            <p className="mt-1 text-sm text-muted">{providerDescription}</p>
          ) : null}
          {countBadges.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {countBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {grouped.main.length > 0 ? (
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {getMenuItemTypeLabel("main")}s
            </h3>
            <div className="mt-1">
              {grouped.main.map((item) => (
                <MenuItemRow
                  key={item.id}
                  name={item.name}
                  unitLabel={item.unitLabel}
                  price={item.price}
                  selected={draft.mainId === item.id}
                  disabled={disabled}
                  onAdd={() => onSelectMain(item.id)}
                  onRemove={onRemoveMain}
                />
              ))}
            </div>
          </section>
        ) : null}

        {grouped.side.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">
              {getMenuItemTypeLabel("side")}s
            </h3>
            <div className="mt-1">
              {grouped.side.map((item) => (
                <MenuItemRow
                  key={item.id}
                  name={item.name}
                  unitLabel={item.unitLabel}
                  price={item.price}
                  selected={draft.sideIds.includes(item.id)}
                  disabled={disabled || !draft.mainId}
                  onAdd={() => onAddSide(item.id)}
                  onRemove={() => onRemoveSide(item.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {Object.entries(standaloneGrouped).map(([category, items]) => (
          <section key={category} className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">{category}</h3>
            <div className="mt-1">
              {items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  name={item.name}
                  unitLabel={item.unitLabel}
                  price={item.price}
                  selected={isStandaloneInDraft(draft, item.id)}
                  disabled={disabled}
                  onAdd={() => onAddStandalone(item.id)}
                  onRemove={() => onRemoveStandalone(item.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </Card>
    </div>
  );
}
