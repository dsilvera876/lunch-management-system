"use client";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Card } from "@/components/ui/card";
import { IconArrowRight } from "@/components/icons/line-icons";
import { formatCurrency } from "@/lib/format";
import { formatMenuItemLabel } from "@/lib/menu-items";
import { calculateMealBundleSubtotal } from "@/lib/order-payload";
import { calculateMarginalOrderCheckout } from "@/lib/order-subsidy-preview";
import { calculateLineSubtotal } from "@/lib/ordering-ui";
import type { LunchCartEntry } from "@/lib/lunch-cart";
import { countDistinctProviders, groupCartEntriesForDisplay } from "@/lib/lunch-cart";
import type { CheckoutValidation } from "@/lib/lunch-checkout";
import { SUMMARY_LINE_GRID, TrashButton } from "@/components/lunch/order-summary-panel";

function formatLinePrice(price: number): string {
  return price > 0 ? formatCurrency(price) : "Included";
}

function CartLineRow({
  name,
  unitLabel,
  price,
}: {
  name: string;
  unitLabel: string;
  price: number;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <span className="min-w-0 text-sm font-medium text-foreground">
        {formatMenuItemLabel(name, unitLabel)}
      </span>
      <span className="text-right text-sm tabular-nums text-muted">{formatLinePrice(price)}</span>
    </li>
  );
}

type MenuItemView = {
  id: string;
  name: string;
  unitLabel: string;
  price: number;
};

type Props = {
  cart: LunchCartEntry[];
  checkout: CheckoutValidation;
  providersById: Map<string, { menuItems: MenuItemView[] }>;
  dailySubsidy: number;
  existingOrderDateGross: number;
  guidanceMessage: string | null;
  canSubmit: boolean;
  orderingOpen: boolean;
  isSubmitting: boolean;
  onClearAll: () => void;
  onRemoveEntry: (entryId: string) => void;
};

function formatInstructionsPreview(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function calculateEntrySubtotal(
  entry: LunchCartEntry,
  menuItems: MenuItemView[],
): number {
  const main = entry.draft.mainId
    ? (menuItems.find((item) => item.id === entry.draft.mainId) ?? null)
    : null;
  const sides = menuItems.filter((item) => entry.draft.sideIds.includes(item.id));
  let total = 0;

  if (main && sides.length > 0) {
    total += calculateMealBundleSubtotal(entry.draft.mealQuantity, [
      main.price,
      ...sides.map((side) => side.price),
    ]);
  }

  for (const [itemId, quantity] of Object.entries(entry.draft.standaloneQuantities)) {
    if (quantity > 0) {
      const item = menuItems.find((menuItem) => menuItem.id === itemId);
      total += calculateLineSubtotal(item?.price ?? 0, quantity);
    }
  }

  return total;
}

export function LunchCartPanel({
  cart,
  checkout,
  providersById,
  dailySubsidy,
  existingOrderDateGross,
  guidanceMessage,
  canSubmit,
  orderingOpen,
  isSubmitting,
  onClearAll,
  onRemoveEntry,
}: Props) {
  const grouped = groupCartEntriesForDisplay(cart);
  const orderCount = cart.length;
  const providerCount = countDistinctProviders(cart);

  const checkoutPreview = calculateMarginalOrderCheckout({
    dailySubsidy,
    existingOrderDateGross,
    orderSubtotal: checkout.combinedSubtotal,
  });

  const hasCartEntries = cart.length > 0;

  return (
    <Card
      padding="md"
      className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Lunch Cart</h2>
          {hasCartEntries ? (
            <p className="mt-0.5 text-sm text-muted">
              {orderCount} {orderCount === 1 ? "order" : "orders"} from {providerCount}{" "}
              {providerCount === 1 ? "provider" : "providers"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!orderingOpen || !hasCartEntries}
          className="shrink-0 text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear All
        </button>
      </div>

      {!hasCartEntries ? (
        <p className="mt-3 text-sm text-muted">
          Your lunch cart is empty. Build a lunch selection and choose &ldquo;Add to Lunch
          Cart&rdquo;.
        </p>
      ) : null}

      <div className="mt-3 space-y-6">
        {grouped.map((group) => (
          <section key={group.providerId}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {group.providerName}
            </h3>
            <div className="mt-3 space-y-4">
              {group.entries.map((entry) => {
                const menuItems = providersById.get(entry.providerId)?.menuItems ?? [];
                const main = entry.draft.mainId
                  ? (menuItems.find((item) => item.id === entry.draft.mainId) ?? null)
                  : null;
                const sides = menuItems.filter((item) =>
                  entry.draft.sideIds.includes(item.id),
                );
                const standaloneItems = menuItems
                  .filter((item) => (entry.draft.standaloneQuantities[item.id] ?? 0) > 0)
                  .map((item) => ({
                    ...item,
                    quantity: entry.draft.standaloneQuantities[item.id] ?? 0,
                  }));
                const instructions = formatInstructionsPreview(entry.draft.specialInstructions);
                const orderTotal = calculateEntrySubtotal(entry, menuItems);

                return (
                  <article
                    key={entry.id}
                    className="rounded-lg border border-border bg-surface/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        Order {entry.providerOrderIndex}
                      </p>
                      <TrashButton
                        label={`Remove order ${entry.providerOrderIndex} from lunch cart`}
                        disabled={!orderingOpen}
                        onClick={() => onRemoveEntry(entry.id)}
                      />
                    </div>

                    {main ? (
                      <div className="mt-2">
                        <ul className="space-y-2">
                          <CartLineRow
                            name={main.name}
                            unitLabel={main.unitLabel}
                            price={main.price}
                          />
                          {sides.map((side) => (
                            <CartLineRow
                              key={side.id}
                              name={side.name}
                              unitLabel={side.unitLabel}
                              price={side.price}
                            />
                          ))}
                        </ul>
                        <p className="mt-2 text-sm text-muted">
                          Meal quantity ×{entry.draft.mealQuantity}
                        </p>
                      </div>
                    ) : null}

                    {standaloneItems.length > 0 ? (
                      <ul className={`space-y-2 ${main ? "mt-3" : "mt-2"}`}>
                        {standaloneItems.map((item) => {
                          const lineTotal = calculateLineSubtotal(item.price, item.quantity);
                          return (
                            <li key={item.id} className={SUMMARY_LINE_GRID}>
                              <span className="min-w-0 text-sm font-medium text-foreground">
                                {formatMenuItemLabel(item.name, item.unitLabel)}
                              </span>
                              <span className="text-right text-sm tabular-nums text-muted">
                                {item.quantity} × {formatCurrency(item.price)}
                              </span>
                              <span aria-hidden className="size-9" />
                              <div className="col-span-3 flex justify-end pr-0">
                                <span className="text-sm font-medium tabular-nums text-foreground">
                                  {formatCurrency(lineTotal)}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    {instructions ? (
                      <p className="mt-2 text-sm text-foreground">
                        <span className="font-medium text-muted">Instructions:</span>{" "}
                        {instructions}
                      </p>
                    ) : null}

                    <dl className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-2 text-sm">
                      <dt className="font-medium text-muted">Order total</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {formatCurrency(orderTotal)}
                      </dd>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {guidanceMessage && !canSubmit ? (
        <p className="mt-3 text-sm text-amber-900" role="status">
          {guidanceMessage}
        </p>
      ) : null}

      {checkout.combinedSubtotal > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(checkoutPreview.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Lunch Subsidy</dt>
            <dd className="font-medium tabular-nums text-muted">
              {checkoutPreview.lunchSubsidy > 0
                ? `-${formatCurrency(checkoutPreview.lunchSubsidy)}`
                : formatCurrency(0)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 pt-1 text-base">
            <dt className="font-semibold text-slate-900">You Pay</dt>
            <dd className="font-semibold tabular-nums text-primary">
              {formatCurrency(checkoutPreview.youPay)}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-4">
        <FormSubmitButton
          pendingText="Placing order…"
          variant="primary"
          disabled={!orderingOpen || !canSubmit}
          forcePending={isSubmitting}
          className="min-h-12 w-full justify-center gap-2 text-base font-semibold"
        >
          Place Order
          <IconArrowRight size={18} className="opacity-90" />
        </FormSubmitButton>
        {hasCartEntries ? (
          <p className="mt-2 text-center text-xs text-muted">
            This will submit all {orderCount} {orderCount === 1 ? "order" : "orders"} in your lunch
            cart.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
