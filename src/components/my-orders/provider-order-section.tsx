import Link from "next/link";
import type { ReactNode } from "react";
import { formatCurrency, formatPrice } from "@/lib/format";
import {
  formatMenuItemLabel,
  formatOrderLineLabel,
} from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import {
  getOrderFinancialStatusLabel,
  getMealAndStandaloneLines,
  isFinanciallyChargeableOrder,
  type StaffProviderOrder,
} from "@/lib/staff-my-orders";
import { linkButtonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormSubmitButton } from "@/components/form-submit-button";
import { cancelLunchOrder } from "@/app/lunch/actions";
import { MenuItemRatingBlock } from "@/components/menu-item-ratings/menu-item-rating-block";
import { MenuItemMostPopularBadge } from "@/components/menu-item-ratings/menu-item-most-popular-badge";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";
import { isProviderOrderEligibleForMenuItemRatingsUi } from "@/lib/menu-item-ratings-eligibility-ui";

type Props = {
  order: StaffProviderOrder;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
};

const providerCardAccents = [
  {
    header: "border-teal-200 bg-teal-50",
    marker: "bg-teal-700 text-white",
    total: "text-teal-800",
  },
  {
    header: "border-indigo-200 bg-indigo-50",
    marker: "bg-indigo-700 text-white",
    total: "text-indigo-800",
  },
  {
    header: "border-amber-200 bg-amber-50",
    marker: "bg-amber-800 text-white",
    total: "text-amber-900",
  },
  {
    header: "border-sky-200 bg-sky-50",
    marker: "bg-sky-700 text-white",
    total: "text-sky-800",
  },
] as const;

function formatIncludedPrice(price: number): string {
  return price > 0 ? formatCurrency(price) : "Included";
}

function OrderPriceLine({
  children,
  price,
  emphasized = false,
}: {
  children: ReactNode;
  price: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1">
      <span className="min-w-0 break-words">{children}</span>
      <span
        aria-hidden
        className="mx-1 min-w-4 flex-1 border-b-2 border-dotted border-slate-300"
        data-testid="order-price-leader"
      />
      <span
        className={`shrink-0 tabular-nums ${emphasized ? "font-semibold text-foreground" : "text-muted"}`}
      >
        <span className="sr-only">Price: </span>
        {price}
      </span>
    </div>
  );
}

function mostPopularBadgeForLine(
  line: StaffProviderOrder["lines"][number],
  order: StaffProviderOrder,
  ratingSummaries?: MenuItemRatingSummariesById,
  ratingsLoadFailed?: boolean,
) {
  if (
    line.itemType !== "main" ||
    !order.ratingsEnabled ||
    ratingsLoadFailed ||
    !line.providerMenuItemId
  ) {
    return null;
  }
  if (ratingSummaries?.[line.providerMenuItemId]?.isMostPopular) {
    return <MenuItemMostPopularBadge />;
  }
  return null;
}

function OrderLineRatings({
  line,
  order,
  ratingSummaries,
  ratingsLoadFailed,
}: {
  line: StaffProviderOrder["lines"][number];
  order: StaffProviderOrder;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
}) {
  if (
    line.itemType !== "main" ||
    !order.ratingsEnabled ||
    !line.providerMenuItemId
  ) {
    return null;
  }

  if (!isProviderOrderEligibleForMenuItemRatingsUi(order)) {
    return null;
  }

  return (
    <MenuItemRatingBlock
      providerMenuItemId={line.providerMenuItemId}
      itemName={line.name}
      initialSummary={ratingSummaries?.[line.providerMenuItemId]}
      ratingsEnabled={order.ratingsEnabled}
      summariesLoadFailed={ratingsLoadFailed}
      compact
    />
  );
}

export function ProviderOrderSection({
  order,
  ratingSummaries,
  ratingsLoadFailed,
}: Props) {
  const { mealMain, mealSides, standalone } = getMealAndStandaloneLines(order.lines);
  const accent = providerCardAccents[(order.indexInGroup - 1) % providerCardAccents.length]!;
  const providerHeadingId = `provider-order-heading-${order.id}`;
  const financiallyChargeable = isFinanciallyChargeableOrder(order);
  const financialStatusLabel = getOrderFinancialStatusLabel(order);

  return (
    <article
      aria-labelledby={providerHeadingId}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      data-testid="provider-order-card"
    >
      <header className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5 ${accent.header}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-bold ${accent.marker}`}
          >
            {order.indexInGroup}
          </span>
          <div className="min-w-0">
            <h4 id={providerHeadingId} className="break-words text-base font-semibold text-slate-950">
              {order.providerName}
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Order {order.indexInGroup} of {order.groupOrderCount}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-800 ring-1 ring-inset ring-slate-300">
            {order.statusLabel}
          </span>
          {order.isLateOrder ? <StatusBadge status="late_order" /> : null}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 text-sm sm:px-5">
        {mealMain ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {formatMealBundleLabel(order.mealQuantity ?? 1)}
            </p>
            <ul className="mt-2 space-y-2">
              <li className="space-y-2">
                <OrderPriceLine
                  price={formatIncludedPrice(mealMain.lineTotal)}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-foreground">
                    <span>
                      {formatMenuItemLabel(mealMain.name, mealMain.unitLabel)} ×{" "}
                      {order.mealQuantity ?? 1}
                    </span>
                    {mostPopularBadgeForLine(mealMain, order, ratingSummaries, ratingsLoadFailed)}
                  </span>
                </OrderPriceLine>
                <OrderLineRatings
                  line={mealMain}
                  order={order}
                  ratingSummaries={ratingSummaries}
                  ratingsLoadFailed={ratingsLoadFailed}
                />
              </li>
              {mealSides.map((side) => (
                <li key={`${side.name}-${side.providerMenuItemId ?? side.unitLabel}`} className="space-y-2">
                  <OrderPriceLine price={formatIncludedPrice(side.lineTotal)}>
                    <span className="flex min-w-0 flex-wrap items-center gap-2 text-foreground">
                      <span>
                        + {formatMenuItemLabel(side.name, side.unitLabel)}
                        {side.quantity > 1 ? ` × ${side.quantity}` : ""}
                      </span>
                      {mostPopularBadgeForLine(side, order, ratingSummaries, ratingsLoadFailed)}
                    </span>
                  </OrderPriceLine>
                  <OrderLineRatings
                    line={side}
                    order={order}
                    ratingSummaries={ratingSummaries}
                    ratingsLoadFailed={ratingsLoadFailed}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {standalone.length > 0 ? (
          <ul className="space-y-2">
            {standalone.map((item) => (
              <li key={`${item.name}-${item.unitLabel}`} className="space-y-2">
                <OrderPriceLine price={formatCurrency(item.lineTotal)} emphasized>
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-foreground">
                    <span>
                      {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                    </span>
                    {mostPopularBadgeForLine(item, order, ratingSummaries, ratingsLoadFailed)}
                  </span>
                </OrderPriceLine>
                {item.unitPrice > 0 && item.quantity > 1 ? (
                  <p className="text-xs text-muted">{formatPrice(item.unitPrice)} each</p>
                ) : null}
                <OrderLineRatings
                  line={item}
                  order={order}
                  ratingSummaries={ratingSummaries}
                  ratingsLoadFailed={ratingsLoadFailed}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {order.specialInstructions?.trim() ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <span className="font-semibold">Note to kitchen:</span>{" "}
            {order.specialInstructions.trim()}
          </p>
        ) : null}
      </div>

      <footer className="flex flex-col gap-3 border-t border-border bg-slate-50/70 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-baseline justify-between gap-4 sm:justify-start">
            <span className="text-sm text-muted">
              {financiallyChargeable ? "Order total" : "Original order value"}
            </span>
            <strong className={`text-xl tabular-nums ${accent.total}`}>
              {formatCurrency(order.orderTotal)}
            </strong>
          </div>
          {financialStatusLabel ? (
            <p className="mt-1 text-sm font-medium text-muted">{financialStatusLabel}</p>
          ) : null}
        </div>

        {order.canEdit || order.canCancel ? (
          <div className="flex flex-wrap items-center gap-2">
            {order.canEdit ? (
              <Link
                href={`/lunch/orders/${order.id}?edit=1`}
                className={`${linkButtonClass("secondary")} min-h-10 px-3 py-2 text-sm`}
              >
                <span>Edit order</span>
                <span className="sr-only"> from {order.providerName}</span>
              </Link>
            ) : null}
            {order.canCancel ? (
              <form action={cancelLunchOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <FormSubmitButton
                  pendingText={`Cancelling order from ${order.providerName}...`}
                  confirmMessage={`Cancel order ${order.indexInGroup} of ${order.groupOrderCount} from ${order.providerName}? Your other orders for this delivery date will not be affected.`}
                  variant="danger"
                  className="min-h-10 px-3 py-2 text-sm"
                >
                  <span>Cancel order</span>
                  <span className="sr-only"> from {order.providerName}</span>
                </FormSubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </footer>
    </article>
  );
}
