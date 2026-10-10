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
  LUNCH_PROVIDER_MENU_TABPANEL_ID,
  SELECT_MAIN_BEFORE_SIDE_MESSAGE,
} from "@/lib/accessible-tabs";
import { useId } from "react";
import { STAFF_PRIMARY_CTA_CLASS, STAFF_SOLID_FOCUS_CLASS } from "@/lib/staff-visual-contrast";
import {
  getMenuItemTypeLabel,
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  type MenuItemType,
} from "@/lib/menu-items";
import { MenuItemRatingBlock } from "@/components/menu-item-ratings/menu-item-rating-block";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";
import { MenuItemRatingsLoadNotice } from "@/components/menu-item-ratings/menu-item-ratings-load-notice";
import { MenuItemMostPopularBadge } from "@/components/menu-item-ratings/menu-item-most-popular-badge";

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
  ratingsEnabled?: boolean;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
  ratingsLoadErrorMessage?: string | null;
};

function menuItemMostPopularAccessory(
  itemId: string,
  itemType: MenuItemType,
  ratingsEnabled: boolean,
  ratingSummaries?: MenuItemRatingSummariesById,
  ratingsLoadFailed?: boolean,
) {
  if (itemType !== "main" || !ratingsEnabled || ratingsLoadFailed) {
    return null;
  }
  if (ratingSummaries?.[itemId]?.isMostPopular) {
    return <MenuItemMostPopularBadge />;
  }
  return null;
}

function MenuItemRatings({
  itemId,
  itemName,
  ratingsEnabled,
  ratingSummaries,
  ratingsLoadFailed,
}: {
  itemId: string;
  itemName: string;
  ratingsEnabled: boolean;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
}) {
  if (!ratingsEnabled) {
    return null;
  }

  return (
    <MenuItemRatingBlock
      providerMenuItemId={itemId}
      itemName={itemName}
      initialSummary={ratingSummaries?.[itemId]}
      ratingsEnabled={ratingsEnabled}
      summariesLoadFailed={ratingsLoadFailed}
      compact
    />
  );
}

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
  ratingsEnabled = false,
  ratingSummaries,
  ratingsLoadFailed = false,
  ratingsLoadErrorMessage,
}: Props) {
  const grouped = groupMenuItemsByType(menuItems);
  const standaloneGrouped = groupStandaloneItemsByCategory(grouped.standalone);
  const countBadges = summarizeMenuCounts(menuItems);
  const validation = validateProviderDraft(draft);
  const mealComplete = draft.mainId !== null && draft.sideIds.length > 0;
  const selectMainFirstId = useId();
  const needsMainBeforeSide = !disabled && draft.mainId === null && grouped.side.length > 0;

  return (
    <div
      role="tabpanel"
      id={LUNCH_PROVIDER_MENU_TABPANEL_ID}
      aria-labelledby={`provider-tab-${providerId}`}
      className="min-w-0"
    >
      <Card padding="md">
        {ratingsEnabled && ratingsLoadFailed ? (
          <div className="mb-4">
            <MenuItemRatingsLoadNotice
              compact
              message={ratingsLoadErrorMessage ?? undefined}
            />
          </div>
        ) : null}
        <div className="border-b border-border pb-4">
          <h2 className="text-xl font-semibold text-slate-900">{providerName}</h2>
          {providerDescription ? (
            <p className="mt-1 text-sm text-staff-instruction">{providerDescription}</p>
          ) : null}
          {countBadges.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {countBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-staff-teal-strong"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {grouped.main.length > 0 ? (
          <fieldset className="mt-4 m-0 min-w-0 border-0 p-0">
            <legend className="text-sm font-semibold text-slate-900">
              {getMenuItemTypeLabel("main")}s
              <span className="sr-only"> — choose one to build a meal</span>
            </legend>
            <div className="mt-1">
              {grouped.main.map((item) => (
                <div key={item.id}>
                  <MenuItemRow
                    name={item.name}
                    unitLabel={item.unitLabel}
                    price={item.price}
                    selected={draft.mainId === item.id}
                    disabled={disabled}
                    nameAccessory={menuItemMostPopularAccessory(
                      item.id,
                      "main",
                      ratingsEnabled,
                      ratingSummaries,
                      ratingsLoadFailed,
                    )}
                    onAdd={() => onSelectMain(item.id)}
                  />
                  <MenuItemRatings
                    itemId={item.id}
                    itemName={item.name}
                    ratingsEnabled={ratingsEnabled}
                    ratingSummaries={ratingSummaries}
                    ratingsLoadFailed={ratingsLoadFailed}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}

        {grouped.side.length > 0 ? (
          <fieldset
            className="mt-6 m-0 min-w-0 border-0 p-0"
            aria-describedby={needsMainBeforeSide ? selectMainFirstId : undefined}
          >
            {needsMainBeforeSide ? (
              <p id={selectMainFirstId} className="sr-only">
                {SELECT_MAIN_BEFORE_SIDE_MESSAGE}
              </p>
            ) : null}
            {validation.mealIncomplete && draft.mainId ? (
              <p className="mb-2 text-sm text-amber-900" role="status">
                {MEAL_INCOMPLETE_GUIDANCE}
              </p>
            ) : null}
            <legend className="text-sm font-semibold text-slate-900">
              {getMenuItemTypeLabel("side")}s
              <span className="sr-only"> — select at least one with a main item</span>
            </legend>
            <div className="mt-1">
              {grouped.side.map((item) => (
                <div key={item.id}>
                  <MenuItemRow
                    name={item.name}
                    unitLabel={item.unitLabel}
                    price={item.price}
                    selected={draft.sideIds.includes(item.id)}
                    disabled={disabled}
                    blockedUntilMainSelected={needsMainBeforeSide}
                    blockedDescribedBy={needsMainBeforeSide ? selectMainFirstId : undefined}
                    nameAccessory={menuItemMostPopularAccessory(
                      item.id,
                      "side",
                      ratingsEnabled,
                      ratingSummaries,
                      ratingsLoadFailed,
                    )}
                    onAdd={() => onAddSide(item.id)}
                  />
                  <MenuItemRatings
                    itemId={item.id}
                    itemName={item.name}
                    ratingsEnabled={ratingsEnabled}
                    ratingSummaries={ratingSummaries}
                    ratingsLoadFailed={ratingsLoadFailed}
                  />
                </div>
              ))}
            </div>
            {mealComplete ? (
              <div className="mt-4 border-t border-border/60 pt-4">
                <p className="text-xs font-medium text-staff-instruction">Meal quantity</p>
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
          </fieldset>
        ) : null}

        {Object.entries(standaloneGrouped).map(([category, items]) => (
          <fieldset key={category} className="mt-6 m-0 min-w-0 border-0 p-0">
            <legend className="text-sm font-semibold text-slate-900">{category}</legend>
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
                      nameAccessory={menuItemMostPopularAccessory(
                        item.id,
                        "standalone",
                        ratingsEnabled,
                        ratingSummaries,
                        ratingsLoadFailed,
                      )}
                      onAdd={() => onAddStandalone(item.id)}
                    />
                    <MenuItemRatings
                      itemId={item.id}
                      itemName={item.name}
                      ratingsEnabled={ratingsEnabled}
                      ratingSummaries={ratingSummaries}
                      ratingsLoadFailed={ratingsLoadFailed}
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
          </fieldset>
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
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-slate-100 disabled:text-slate-500 ${STAFF_PRIMARY_CTA_CLASS} hover:bg-[#115e59] ${STAFF_SOLID_FOCUS_CLASS}`}
          >
            <IconCheck size={20} aria-hidden />
            Finish This Order
          </button>
          <p className="mt-2 text-center text-sm text-staff-instruction">
            Validates this order and moves it to completed in your lunch cart so you can start
            another.
          </p>
        </div>
      </Card>
    </div>
  );
}
