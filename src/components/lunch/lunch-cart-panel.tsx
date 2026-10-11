"use client";

import { useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  CART_CLEARED_ANNOUNCEMENT,
  formatCartEntryRemoveLabel,
  formatCartEntryRemovedAnnouncement,
  formatCartLineRemoveLabel,
  formatCartLineRemovedAnnouncement,
  resolveRemovalFocusIndex,
  withAnnouncementNonce,
} from "@/lib/lunch-checkout-accessibility";
import { STAFF_CART_STICKY_PANEL_CLASS } from "@/lib/staff-layout-reflow";
import { Card } from "@/components/ui/card";
import { IconArrowRight, IconX } from "@/components/icons/line-icons";
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
  /** Focus the completed entry header after Finish This Order; nonce re-triggers focus. */
  focusEntryRequest: { entryId: string; nonce: number } | null;
  onBlockedPlaceOrder: () => void;
};

type RemoveHandler = (
  event: MouseEvent<HTMLButtonElement>,
  remove: () => void,
  announcement: string,
) => void;

const CART_ENTRY_HEADING_CLASS =
  "min-w-0 space-y-1 rounded-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

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
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
    >
      <IconX size={14} className="text-current" aria-hidden />
      <span aria-hidden="true">Remove</span>
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
    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-staff-teal-strong ring-1 ring-inset ring-primary/30">
      Completed
    </span>
  );
}

function DraftOrderLines({
  draft,
  menuItems,
  providerName,
  orderingOpen,
  allowLineRemove,
  onRemoveMain,
  onRemoveSide,
  onRemoveStandalone,
}: {
  draft: ProviderDraft;
  menuItems: MenuItemView[];
  providerName: string;
  orderingOpen: boolean;
  allowLineRemove: boolean;
  onRemoveMain: (event: MouseEvent<HTMLButtonElement>, itemName: string) => void;
  onRemoveSide: (event: MouseEvent<HTMLButtonElement>, sideId: string, itemName: string) => void;
  onRemoveStandalone: (
    event: MouseEvent<HTMLButtonElement>,
    itemId: string,
    itemName: string,
  ) => void;
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
                <span className="text-sm tabular-nums text-staff-instruction">{formatLinePrice(main.price)}</span>
                {allowLineRemove ? (
                  <CartLineRemoveButton
                    label={formatCartLineRemoveLabel(main.name, providerName)}
                    disabled={!orderingOpen}
                    onClick={(event) => onRemoveMain(event, main.name)}
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
                  <span className="text-sm tabular-nums text-staff-instruction">
                    {formatLinePrice(side.price)}
                  </span>
                  {allowLineRemove ? (
                    <CartLineRemoveButton
                      label={formatCartLineRemoveLabel(side.name, providerName)}
                      disabled={!orderingOpen}
                      onClick={(event) => onRemoveSide(event, side.id, side.name)}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-staff-instruction">Meal quantity ×{draft.mealQuantity}</p>
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
                      <p className="text-xs tabular-nums text-staff-instruction">
                        {item.quantity} × {formatCurrency(item.price)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {formatCurrency(lineTotal)}
                      </span>
                      <CartLineRemoveButton
                        label={formatCartLineRemoveLabel(item.name, providerName)}
                        disabled={!orderingOpen}
                        onClick={(event) => onRemoveStandalone(event, item.id, item.name)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 text-sm font-medium text-foreground">
                      {formatMenuItemLabel(item.name, item.unitLabel)}
                    </span>
                    <span className="text-right text-sm tabular-nums text-staff-instruction">
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

function ProviderSections(
  props: Pick<
    Props,
    | "providersById"
    | "orderingOpen"
    | "onRemoveEntry"
    | "onRemoveInProgressMain"
    | "onRemoveInProgressSide"
    | "onRemoveInProgressStandalone"
  > & { sections: ProviderCartSection[]; onRemove: RemoveHandler },
) {
  const {
    sections,
    providersById,
    orderingOpen,
    onRemoveEntry,
    onRemoveInProgressMain,
    onRemoveInProgressSide,
    onRemoveInProgressStandalone,
    onRemove,
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
                <div
                  className={CART_ENTRY_HEADING_CLASS}
                  tabIndex={-1}
                  data-cart-entry-heading={entry.id}
                >
                  <StatusBadge kind="completed" />
                  <p className="text-sm font-semibold text-slate-900">
                    {section.providerName} — Order {entry.providerOrderIndex}
                  </p>
                </div>
                <TrashButton
                  label={formatCartEntryRemoveLabel(section.providerName, entry.providerOrderIndex)}
                  disabled={!orderingOpen}
                  onClick={(event) =>
                    onRemove(
                      event,
                      () => onRemoveEntry(entry.id),
                      formatCartEntryRemovedAnnouncement(
                        section.providerName,
                        entry.providerOrderIndex,
                      ),
                    )
                  }
                />
              </div>

              <DraftOrderLines
                draft={entry.draft}
                menuItems={menuItems}
                providerName={section.providerName}
                orderingOpen={orderingOpen}
                allowLineRemove={false}
                onRemoveMain={() => undefined}
                onRemoveSide={() => undefined}
                onRemoveStandalone={() => undefined}
              />

              {instructions ? (
                <p className="mt-2 text-sm text-foreground">
                  <span className="font-medium text-staff-instruction">Instructions:</span> {instructions}
                </p>
              ) : null}

              <dl className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-2 text-sm">
                <dt className="font-medium text-staff-instruction">Subtotal</dt>
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
              providerName={section.providerName}
              orderingOpen={orderingOpen}
              allowLineRemove
              onRemoveMain={(event, itemName) =>
                onRemove(
                  event,
                  () => onRemoveInProgressMain(section.providerId),
                  formatCartLineRemovedAnnouncement(itemName, section.providerName),
                )
              }
              onRemoveSide={(event, sideId, itemName) =>
                onRemove(
                  event,
                  () => onRemoveInProgressSide(section.providerId, sideId),
                  formatCartLineRemovedAnnouncement(itemName, section.providerName),
                )
              }
              onRemoveStandalone={(event, itemId, itemName) =>
                onRemove(
                  event,
                  () => onRemoveInProgressStandalone(section.providerId, itemId),
                  formatCartLineRemovedAnnouncement(itemName, section.providerName),
                )
              }
            />

            {formatInstructionsPreview(section.inProgress.draft.specialInstructions) ? (
              <p className="mt-2 text-sm text-foreground">
                <span className="font-medium text-staff-instruction">Instructions:</span>{" "}
                {formatInstructionsPreview(section.inProgress.draft.specialInstructions)}
              </p>
            ) : null}

            <dl className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-2 text-sm">
              <dt className="font-medium text-staff-instruction">Subtotal</dt>
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
  focusEntryRequest,
  onBlockedPlaceOrder,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ kind: "removal"; index: number } | { kind: "heading" } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState({ message: "", nonce: 0 });

  function announce(message: string) {
    setAnnouncement((current) => ({ message, nonce: current.nonce + 1 }));
  }

  function getRemoveButtons(): HTMLButtonElement[] {
    return Array.from(sectionsRef.current?.querySelectorAll("button") ?? []);
  }

  useLayoutEffect(() => {
    const request = pendingFocus.current;
    if (!request) {
      return;
    }
    pendingFocus.current = null;

    if (request.kind === "heading") {
      headingRef.current?.focus();
      return;
    }

    const buttons = getRemoveButtons();
    const nextIndex = resolveRemovalFocusIndex(buttons.length, request.index);
    (nextIndex === null ? headingRef.current : buttons[nextIndex])?.focus();
  });

  useLayoutEffect(() => {
    if (!focusEntryRequest) {
      return;
    }
    const target = sectionsRef.current?.querySelector<HTMLElement>(
      `[data-cart-entry-heading="${CSS.escape(focusEntryRequest.entryId)}"]`,
    );
    target?.focus();
  }, [focusEntryRequest]);

  const handleRemove: RemoveHandler = (event, remove, message) => {
    pendingFocus.current = {
      kind: "removal",
      index: getRemoveButtons().indexOf(event.currentTarget),
    };
    remove();
    announce(message);
  };

  function handleClearAll() {
    pendingFocus.current = { kind: "heading" };
    onClearAll();
    announce(CART_CLEARED_ANNOUNCEMENT);
  }

  const sections = buildProviderCartSections(providers, cart, drafts);
  const orderCount = cart.length;
  const providerCount = countDistinctProviders(cart);
  const hasVisibleContent = hasVisibleCartContent(cart, drafts, providers);

  const checkoutPreview = calculateMarginalOrderCheckout({
    dailySubsidy,
    existingOrderDateGross,
    orderSubtotal: checkout.combinedSubtotal,
  });

  const placeOrderGuidanceId = useId();
  const submitAccessibilityBlocked = !orderingOpen || !canSubmit;
  const placeOrderGuidanceText = !orderingOpen
    ? "Ordering is closed. You cannot place an order right now."
    : !canSubmit && guidanceMessage
      ? guidanceMessage
      : !canSubmit
        ? "Complete your lunch cart before placing your order."
        : null;

  return (
    <Card
      padding="md"
      className={`${STAFF_CART_STICKY_PANEL_CLASS} lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm text-xl font-semibold text-slate-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Lunch Cart
          </h2>
          <p className="mt-1 text-sm leading-5 text-staff-instruction">
            Add items to build an order, then finish it when you&apos;re ready. You can create
            multiple orders before placing your checkout.
          </p>
          {orderCount > 0 ? (
            <p className="mt-1 text-sm text-staff-instruction">
              {orderCount} completed {orderCount === 1 ? "order" : "orders"} from {providerCount}{" "}
              {providerCount === 1 ? "provider" : "providers"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={!orderingOpen || cart.length === 0}
          className="inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-staff-teal hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Clear All
        </button>
      </div>

      {!hasVisibleContent ? (
        <p className="mt-3 text-sm text-staff-instruction">
          Your lunch cart is empty. Use Add beside menu items to start building an order.
        </p>
      ) : (
        <div ref={sectionsRef} className="mt-3 space-y-4">
          <ProviderSections
            sections={sections}
            providersById={providersById}
            orderingOpen={orderingOpen}
            onRemoveEntry={onRemoveEntry}
            onRemoveInProgressMain={onRemoveInProgressMain}
            onRemoveInProgressSide={onRemoveInProgressSide}
            onRemoveInProgressStandalone={onRemoveInProgressStandalone}
            onRemove={handleRemove}
          />
        </div>
      )}

      <p className="sr-only" role="status" aria-atomic="true" data-cart-announcer>
        {withAnnouncementNonce(announcement.message, announcement.nonce)}
      </p>

      {placeOrderGuidanceText ? (
        <p
          id={placeOrderGuidanceId}
          className="mt-3 text-sm text-amber-900"
          role="status"
        >
          {placeOrderGuidanceText}
        </p>
      ) : null}

      {checkout.combinedSubtotal > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-staff-instruction">Subtotal</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(checkoutPreview.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-staff-instruction">Lunch Subsidy</dt>
            <dd className="font-medium tabular-nums text-staff-instruction">
              {checkoutPreview.lunchSubsidy > 0
                ? `-${formatCurrency(checkoutPreview.lunchSubsidy)}`
                : formatCurrency(0)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 pt-1 text-base">
            <dt className="font-semibold text-slate-900">You Pay</dt>
            <dd className="font-semibold tabular-nums text-staff-teal">
              {formatCurrency(checkoutPreview.youPay)}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-4">
        <FormSubmitButton
          pendingText="Placing order…"
          variant="primary"
          staffPrimaryCta
          accessibilityBlocked={submitAccessibilityBlocked}
          ariaDescribedBy={
            submitAccessibilityBlocked ? placeOrderGuidanceId : undefined
          }
          forcePending={isSubmitting}
          focusableWhilePending
          onBlockedActivate={onBlockedPlaceOrder}
          className="min-h-12 w-full justify-center gap-2 text-base font-semibold"
        >
          Place Order
          <IconArrowRight size={18} className="opacity-90" aria-hidden />
        </FormSubmitButton>
        {orderCount > 0 ? (
          <p className="mt-2 text-center text-sm text-staff-instruction">
            This will submit all {orderCount} completed{" "}
            {orderCount === 1 ? "order" : "orders"} in your lunch cart.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
