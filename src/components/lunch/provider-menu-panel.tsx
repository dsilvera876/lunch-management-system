"use client";

import { IconCheck } from "@/components/icons/line-icons";
import { Card } from "@/components/ui/card";
import { MenuItemRow } from "@/components/lunch/menu-item-row";
import { summarizeMenuCounts } from "@/lib/lunch-menu-counts";
import { SpecialInstructionsField } from "@/components/lunch/special-instructions-field";
import { InlineQuantityControl } from "@/components/lunch/inline-quantity-control";
import {
  getStandaloneQuantity,
  isStandaloneInDraft,
  validateProviderDraft,
  type ProviderDraft,
} from "@/lib/lunch-order-draft";
import { MEAL_INCOMPLETE_GUIDANCE } from "@/components/lunch/order-summary-panel";
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
  onAddSide: (itemId: string) => void;
  onAddStandalone: (itemId: string) => void;
  specialInstructions: string;
  onSpecialInstructionsChange: (value: string) => void;
  onMealQuantityChange: (quantity: number) => void;
  onStandaloneQuantityChange: (itemId: string, quantity: number) => void;
  canFinishOrder: boolean;
  onFinishOrder: () => void;
};

export function ProviderMenuPanel({
  providerId,
  providerName,
  providerDescription,
  menuItems,
  draft,
  disabled = false,
  onSelectMain,
  onAddSide,
  onAddStandalone,
  specialInstructions,
  onSpecialInstructionsChange,
  onMealQuantityChange,
  onStandaloneQuantityChange,
  canFinishOrder,
  onFinishOrder,
}: Props) {
  const grouped = groupMenuItemsByType(menuItems);
  const standaloneGrouped = groupStandaloneItemsByCategory(grouped.standalone);
  const countBadges = summarizeMenuCounts(menuItems);
  const validation = validateProviderDraft(draft);
  const mealComplete = draft.mainId !== null && draft.sideIds.length > 0;

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
                />
              ))}
            </div>
            {validation.mealIncomplete ? (
              <p className="mt-2 text-sm text-amber-900" role="status">
                {MEAL_INCOMPLETE_GUIDANCE}
              </p>
            ) : null}
            {mealComplete ? (
              <div className="mt-4 border-t border-border/60 pt-4">
                <p className="text-xs font-medium text-muted">Meal quantity</p>
                <div className="mt-2">
                  <InlineQuantityControl
                    label={`${providerName} meal quantity`}
                    value={draft.mealQuantity}
                    disabled={disabled}
                    onChange={onMealQuantityChange}
                  />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {Object.entries(standaloneGrouped).map(([category, items]) => (
          <section key={category} className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">{category}</h3>
            <div className="mt-1">
              {items.map((item) => {
                const selected = isStandaloneInDraft(draft, item.id);
                const quantity = getStandaloneQuantity(draft, item.id);

                return (
                  <div key={item.id}>
                    <MenuItemRow
                      name={item.name}
                      unitLabel={item.unitLabel}
                      price={item.price}
                      selected={selected}
                      disabled={disabled}
                      onAdd={() => onAddStandalone(item.id)}
                    />
                    {selected ? (
                      <div className="mb-3 ml-0 max-w-xs pl-0">
                        <InlineQuantityControl
                          label={item.name}
                          value={quantity}
                          disabled={disabled}
                          onChange={(next) => onStandaloneQuantityChange(item.id, next)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="mt-6 border-t border-border pt-4">
          <SpecialInstructionsField
            value={specialInstructions}
            onChange={onSpecialInstructionsChange}
            disabled={disabled}
          />
        </div>

        {!validation.valid && !validation.mealIncomplete && validation.message ? (
          <p className="mt-3 text-sm text-amber-900" role="status">
            {validation.message}
          </p>
        ) : null}

        <div className="mt-6 border-t border-border pt-4">
          <button
            type="button"
            disabled={disabled || !canFinishOrder}
            onClick={onFinishOrder}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconCheck size={20} aria-hidden />
            Finish This Order
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            Validates this order and moves it to completed in your lunch cart so you can start
            another.
          </p>
        </div>
      </Card>
    </div>
  );
}
