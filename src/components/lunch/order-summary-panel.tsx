"use client";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Card } from "@/components/ui/card";
import { InlineQuantityControl } from "@/components/lunch/inline-quantity-control";
import { IconArrowRight } from "@/components/icons/line-icons";
import { formatCurrency } from "@/lib/format";
import { formatMenuItemLabel } from "@/lib/menu-items";
import { calculateMealBundleSubtotal } from "@/lib/order-payload";
import { calculateMarginalOrderCheckout } from "@/lib/order-subsidy-preview";
import { SpecialInstructionsField } from "@/components/lunch/special-instructions-field";
import { calculateLineSubtotal } from "@/lib/ordering-ui";

export type SummaryMenuItem = {
  id: string;
  name: string;
  unitLabel: string;
  price: number;
};

type Props = {
  providerName: string;
  main: SummaryMenuItem | null;
  sides: SummaryMenuItem[];
  mealQuantity: number;
  mealIncomplete: boolean;
  standaloneItems: Array<SummaryMenuItem & { quantity: number }>;
  orderSubtotal: number;
  dailySubsidy: number;
  existingOrderDateGross: number;
  specialInstructions: string;
  guidanceMessage: string | null;
  onSpecialInstructionsChange: (value: string) => void;
  onClearAll: () => void;
  onRemoveMain: () => void;
  onRemoveSide: (sideId: string) => void;
  onMealQuantityChange: (quantity: number) => void;
  onStandaloneQuantityChange: (itemId: string, quantity: number) => void;
  onRemoveStandalone: (itemId: string) => void;
  orderingOpen: boolean;
  canSubmit: boolean;
  isSubmitting?: boolean;
};

export const MEAL_INCOMPLETE_GUIDANCE =
  "Choose at least one side to complete this meal.";

export const SUMMARY_LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_5.5rem_2.25rem] items-start gap-x-3";

function formatLinePrice(price: number): string {
  return price > 0 ? formatCurrency(price) : "Included";
}

export function TrashButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function OrderLineRow({
  name,
  unitLabel,
  price,
  nameClassName = "text-sm text-foreground",
  removeLabel,
  orderingOpen,
  onRemove,
}: {
  name: string;
  unitLabel: string;
  price: number;
  nameClassName?: string;
  removeLabel: string;
  orderingOpen: boolean;
  onRemove: () => void;
}) {
  return (
    <li className={SUMMARY_LINE_GRID}>
      <span className={`min-w-0 ${nameClassName}`}>
        {formatMenuItemLabel(name, unitLabel)}
      </span>
      <span className="text-right text-sm tabular-nums text-muted">
        {formatLinePrice(price)}
      </span>
      <TrashButton label={removeLabel} disabled={!orderingOpen} onClick={onRemove} />
    </li>
  );
}

export function OrderSummaryPanel({
  providerName,
  main,
  sides,
  mealQuantity,
  mealIncomplete,
  standaloneItems,
  orderSubtotal,
  dailySubsidy,
  existingOrderDateGross,
  specialInstructions,
  guidanceMessage,
  onSpecialInstructionsChange,
  onClearAll,
  onRemoveMain,
  onRemoveSide,
  onMealQuantityChange,
  onStandaloneQuantityChange,
  onRemoveStandalone,
  orderingOpen,
  canSubmit,
  isSubmitting = false,
}: Props) {
  const checkout = calculateMarginalOrderCheckout({
    dailySubsidy,
    existingOrderDateGross,
    orderSubtotal,
  });

  const hasMealSection = main !== null;
  const hasStandalone = standaloneItems.length > 0;
  const hasAnyContent = hasMealSection || hasStandalone;

  const mealLineTotal =
    main !== null && !mealIncomplete
      ? calculateMealBundleSubtotal(mealQuantity, [main.price, ...sides.map((side) => side.price)])
      : 0;

  return (
    <Card padding="md" className="lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">Your Order</h2>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!orderingOpen || !hasAnyContent}
          className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear All
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{providerName}</p>

      {!hasAnyContent ? (
        <p className="mt-3 text-sm text-muted">Add menu items to build your order.</p>
      ) : null}

      {hasMealSection && main ? (
        <section className="mt-3 border-b border-border pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Meal</h3>
          <ul className="mt-2 space-y-2">
            <OrderLineRow
              name={main.name}
              unitLabel={main.unitLabel}
              price={main.price}
              nameClassName="text-sm font-medium text-foreground"
              removeLabel={`Remove ${main.name} from order`}
              orderingOpen={orderingOpen}
              onRemove={onRemoveMain}
            />
            {sides.map((side) => (
              <OrderLineRow
                key={side.id}
                name={side.name}
                unitLabel={side.unitLabel}
                price={side.price}
                removeLabel={`Remove ${side.name} from order`}
                orderingOpen={orderingOpen}
                onRemove={() => onRemoveSide(side.id)}
              />
            ))}
          </ul>

          {mealIncomplete ? (
            <p className="mt-3 text-sm text-amber-900" role="status">
              {MEAL_INCOMPLETE_GUIDANCE}
            </p>
          ) : (
            <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-xs font-medium text-muted">Quantity</p>
                <div className="mt-2">
                  <InlineQuantityControl
                    label="Meal quantity"
                    value={mealQuantity}
                    disabled={!orderingOpen}
                    onChange={onMealQuantityChange}
                  />
                </div>
              </div>
              <dl className="flex justify-between gap-4 text-sm">
                <dt className="font-medium text-muted">Meal total</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(mealLineTotal)}
                </dd>
              </dl>
            </div>
          )}
        </section>
      ) : null}

      {hasStandalone ? (
        <section className="mt-3 border-b border-border pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Extras</h3>
          <ul className="mt-2 space-y-3">
            {standaloneItems.map((item) => {
              const lineTotal = calculateLineSubtotal(item.price, item.quantity);
              return (
                <li key={item.id}>
                  <div className={SUMMARY_LINE_GRID}>
                    <p className="min-w-0 text-sm font-medium text-foreground">
                      {formatMenuItemLabel(item.name, item.unitLabel)}
                    </p>
                    <span className="text-right text-sm tabular-nums text-muted">
                      {item.quantity} × {formatCurrency(item.price)}
                    </span>
                    <TrashButton
                      label={`Remove ${item.name} from order`}
                      disabled={!orderingOpen}
                      onClick={() => onRemoveStandalone(item.id)}
                    />
                  </div>
                  <div className="mt-1 flex justify-end pr-11">
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <InlineQuantityControl
                      label={item.name}
                      value={item.quantity}
                      disabled={!orderingOpen}
                      onChange={(quantity) => onStandaloneQuantityChange(item.id, quantity)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {guidanceMessage && !canSubmit ? (
        <p className="mt-3 text-sm text-amber-900" role="status">
          {guidanceMessage}
        </p>
      ) : null}

      <div className="mt-3">
        <SpecialInstructionsField
          value={specialInstructions}
          onChange={onSpecialInstructionsChange}
          disabled={!orderingOpen}
        />
      </div>

      {orderSubtotal > 0 ? (
        <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(checkout.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Lunch Subsidy</dt>
            <dd className="font-medium tabular-nums text-muted">
              {checkout.lunchSubsidy > 0
                ? `-${formatCurrency(checkout.lunchSubsidy)}`
                : formatCurrency(0)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 pt-1 text-base">
            <dt className="font-semibold text-slate-900">You Pay</dt>
            <dd className="font-semibold tabular-nums text-primary">
              {formatCurrency(checkout.youPay)}
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
        <p className="mt-2 text-center text-xs text-muted">
          You can place separate orders with different providers before the cutoff time.
        </p>
      </div>
    </Card>
  );
}
