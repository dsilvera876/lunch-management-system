"use client";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Card } from "@/components/ui/card";
import { IconArrowRight, IconCartMinus } from "@/components/icons/line-icons";
import { formatCurrency } from "@/lib/format";
import { formatMenuItemLabel } from "@/lib/menu-items";
import { calculateMarginalOrderCheckout } from "@/lib/order-subsidy-preview";
import { calculateLineSubtotal } from "@/lib/ordering-ui";
import type { LunchCartEntry, ProviderCartSection } from "@/lib/lunch-cart";
import { buildProviderCartSections, countDistinctProviders, hasVisibleCartContent } from "@/lib/lunch-cart";
import type { CheckoutValidation } from "@/lib/lunch-checkout";
import { calculateDraftSubtotal, type ProviderDraft } from "@/lib/lunch-order-draft";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";
import { SUMMARY_LINE_GRID, TrashButton } from "@/components/lunch/order-summary-panel";

function formatLinePrice(price: number): string {
  return price > 0 ? formatCurrency(price) : "Included";
}

type MenuItemView = {
  id: string;
  name: string;
  unitLabel: string;
  price: number;
};

type Props = {
  cart: LunchCartEntry[];
  drafts: Record<string, ProviderDraft>;
  providers: ProviderMenuBundle[];
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
  onRemoveInProgressMain: (providerId: string) => void;
  onRemoveInProgressSide: (providerId: string, sideId: string) => void;
  onRemoveInProgressStandalone: (providerId: string, itemId: string) => void;
};

function formatInstructionsPreview(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function calculateEntrySubtotal(
  draft: ProviderDraft,
  menuItems: MenuItemView[],
): number {
  return calculateDraftSubtotal(draft, menuItems);
}

function CartLineRemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-slate-100 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <IconCartMinus size={14} aria-hidden />
      Remove
      <span className="sr-only">{label}</span>
    </button>
  );
}

function StatusBadge({ kind }: { kind: "in-progress" | "completed" }) {
  if (kind === "in-progress") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-inset ring-emerald-200">
        In progress
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/20">
      Completed
    </span>
  );
}

function DraftOrderLines({
  draft,
  menuItems,
  orderingOpen,
  allowLineRemove,
  onRemoveMain,
  onRemoveSide,
  onRemoveStandalone,
}: {
  draft: ProviderDraft;
  menuItems: MenuItemView[];
  orderingOpen: boolean;
  allowLineRemove: boolean;
  onRemoveMain: () => void;
  onRemoveSide: (sideId: string) => void;
  onRemoveStandalone: (itemId: string) => void;
}) {
  const main = draft.mainId
    ? (menuItems.find((item) => item.id === draft.mainId) ?? null)
    : null;
  const sides = menuItems.filter((item) => draft.sideIds.includes(item.id));
  const standaloneItems = menuItems
    .filter((item) => (draft.standaloneQuantities[item.id] ?? 0) > 0)
    .map((item) => ({
      ...item,
      quantity: draft.standaloneQuantities[item.id] ?? 0,
    }));

  return (
    <>
      {main ? (
        <div className="mt-2">
          <ul className="space-y-2">
            <li className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-sm font-medium text-foreground">
                {formatMenuItemLabel(main.name, main.unitLabel)}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm tabular-nums text-muted">{formatLinePrice(main.price)}</span>
                {allowLineRemove ? (
                  <CartLineRemoveButton
                    label={main.name}
                    disabled={!orderingOpen}
                    onClick={onRemoveMain}
                  />
                ) : null}
              </div>
            </li>
            {sides.map((side) => (
              <li key={side.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-sm font-medium text-foreground">
                  {formatMenuItemLabel(side.name, side.unitLabel)}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-muted">
                    {formatLinePrice(side.price)}
                  </span>
                  {allowLineRemove ? (
                    <CartLineRemoveButton
                      label={side.name}
                      disabled={!orderingOpen}
                      onClick={() => onRemoveSide(side.id)}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Meal quantity ×{draft.mealQuantity}</p>
        </div>
      ) : null}

      {standaloneItems.length > 0 ? (
        <ul className={`space-y-2 ${main ? "mt-3" : "mt-2"}`}>
          {standaloneItems.map((item) => {
            const lineTotal = calculateLineSubtotal(item.price, item.quantity);
            return (
              <li key={item.id} className={allowLineRemove ? undefined : SUMMARY_LINE_GRID}>
                {allowLineRemove ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatMenuItemLabel(item.name, item.unitLabel)}
                      </p>
                      <p className="text-xs tabular-nums text-muted">
                        {item.quantity} × {formatCurrency(item.price)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {formatCurrency(lineTotal)}
                      </span>
                      <CartLineRemoveButton
                        label={item.name}
                        disabled={!orderingOpen}
                        onClick={() => onRemoveStandalone(item.id)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function renderProviderSections(
  sections: ProviderCartSection[],
  props: Pick<
    Props,
    | "providersById"
    | "orderingOpen"
    | "onRemoveEntry"
    | "onRemoveInProgressMain"
    | "onRemoveInProgressSide"
    | "onRemoveInProgressStandalone"
  >,
) {
  const {
    providersById,
    orderingOpen,
    onRemoveEntry,
    onRemoveInProgressMain,
    onRemoveInProgressSide,
    onRemoveInProgressStandalone,
  } = props;

  return sections.map((section) => {
    const menuItems = providersById.get(section.providerId)?.menuItems ?? [];

    return (
      <section key={section.providerId} className="space-y-4">
        {section.completedEntries.map((entry) => {
          const instructions = formatInstructionsPreview(entry.draft.specialInstructions);
          const orderTotal = calculateEntrySubtotal(entry.draft, menuItems);

          return (
            <article
              key={entry.id}
              className="rounded-lg border border-border bg-surface/50 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <StatusBadge kind="completed" />
                  <p className="text-sm font-semibold text-slate-900">
                    {section.providerName} — Order {entry.providerOrderIndex}
                  </p>
                </div>
                <TrashButton
                  label={`Remove order ${entry.providerOrderIndex} from lunch cart`}
                  disabled={!orderingOpen}
                  onClick={() => onRemoveEntry(entry.id)}
                />
              </div>

              <DraftOrderLines
                draft={entry.draft}
                menuItems={menuItems}
                orderingOpen={orderingOpen}
                allowLineRemove={false}
                onRemoveMain={() => undefined}
                onRemoveSide={() => undefined}
                onRemoveStandalone={() => undefined}
              />

              {instructions ? (
                <p className="mt-2 text-sm text-foreground">
                  <span className="font-medium text-muted">Instructions:</span> {instructions}
                </p>
              ) : null}

              <dl className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-2 text-sm">
                <dt className="font-medium text-muted">Subtotal</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(orderTotal)}
                </dd>
              </dl>
            </article>
          );
        })}

        {section.inProgress ? (
          <article className="rounded-lg border border-emerald-200/80 bg-emerald-50/30 p-3">
            <div className="space-y-1">
              <StatusBadge kind="in-progress" />
              <p className="text-sm font-semibold text-slate-900">
                {section.providerName} — Order {section.inProgress.providerOrderIndex}
              </p>
            </div>

            <DraftOrderLines
              draft={section.inProgress.draft}
              menuItems={menuItems}
              orderingOpen={orderingOpen}
              allowLineRemove
              onRemoveMain={() => onRemoveInProgressMain(section.providerId)}
              onRemoveSide={(sideId) => onRemoveInProgressSide(section.providerId, sideId)}
              onRemoveStandalone={(itemId) =>
                onRemoveInProgressStandalone(section.providerId, itemId)
              }
            />

            {formatInstructionsPreview(section.inProgress.draft.specialInstructions) ? (
              <p className="mt-2 text-sm text-foreground">
                <span className="font-medium text-muted">Instructions:</span>{" "}
                {formatInstructionsPreview(section.inProgress.draft.specialInstructions)}
              </p>
            ) : null}

            <dl className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-2 text-sm">
              <dt className="font-medium text-muted">Subtotal</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatCurrency(
                  calculateEntrySubtotal(section.inProgress.draft, menuItems),
                )}
              </dd>
            </dl>
          </article>
        ) : null}
      </section>
    );
  });
}

export function LunchCartPanel({
  cart,
  drafts,
  providers,
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
  onRemoveInProgressMain,
  onRemoveInProgressSide,
  onRemoveInProgressStandalone,
}: Props) {
  const sections = buildProviderCartSections(providers, cart, drafts);
  const orderCount = cart.length;
  const providerCount = countDistinctProviders(cart);
  const hasVisibleContent = hasVisibleCartContent(cart, drafts, providers);

  const checkoutPreview = calculateMarginalOrderCheckout({
    dailySubsidy,
    existingOrderDateGross,
    orderSubtotal: checkout.combinedSubtotal,
  });

  return (
    <Card
      padding="md"
      className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Lunch Cart</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Add items to build an order, then finish it when you&apos;re ready. You can create
            multiple orders before placing your checkout.
          </p>
          {orderCount > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {orderCount} completed {orderCount === 1 ? "order" : "orders"} from {providerCount}{" "}
              {providerCount === 1 ? "provider" : "providers"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!orderingOpen || cart.length === 0}
          className="shrink-0 text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear All
        </button>
      </div>

      {!hasVisibleContent ? (
        <p className="mt-3 text-sm text-muted">
          Your lunch cart is empty. Use Add beside menu items to start building an order.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {renderProviderSections(sections, {
            providersById,
            orderingOpen,
            onRemoveEntry,
            onRemoveInProgressMain,
            onRemoveInProgressSide,
            onRemoveInProgressStandalone,
          })}
        </div>
      )}

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
        {orderCount > 0 ? (
          <p className="mt-2 text-center text-xs text-muted">
            This will submit all {orderCount} completed{" "}
            {orderCount === 1 ? "order" : "orders"} in your lunch cart.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
