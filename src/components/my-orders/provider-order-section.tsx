import Link from "next/link";
import { formatCurrency, formatPrice } from "@/lib/format";
import {
  formatMenuItemLabel,
  formatOrderLineLabel,
} from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import {
  getMealAndStandaloneLines,
  type StaffProviderOrder,
} from "@/lib/staff-my-orders";
import { linkButtonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { MenuItemRatingBlock } from "@/components/menu-item-ratings/menu-item-rating-block";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";
import { isProviderOrderEligibleForMenuItemRatingsUi } from "@/lib/menu-item-ratings-eligibility-ui";

type Props = {
  order: StaffProviderOrder;
  showViewLink?: boolean;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
};

function formatIncludedPrice(price: number): string {
  return price > 0 ? formatCurrency(price) : "Included";
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
  if (!order.ratingsEnabled || !line.providerMenuItemId) {
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
  showViewLink = true,
  ratingSummaries,
  ratingsLoadFailed,
}: Props) {
  const { mealMain, mealSides, standalone } = getMealAndStandaloneLines(order.lines);

  return (
    <section className="border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900">{order.providerName}</h4>
            {order.isLateOrder ? <StatusBadge status="late_order" /> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Order {order.indexInGroup} of {order.groupOrderCount}
          </p>
        </div>
        {showViewLink ? (
          <Link
            href={`/lunch/orders/${order.id}`}
            className={`${linkButtonClass("secondary")} min-h-9 px-3 py-1.5 text-xs`}
          >
            View order
          </Link>
        ) : null}
      </div>

      <div className="mt-3 space-y-3 text-sm">
        {mealMain ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {formatMealBundleLabel(order.mealQuantity ?? 1)}
            </p>
            <ul className="mt-2 space-y-2">
              <li className="space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-foreground">
                    {formatMenuItemLabel(mealMain.name, mealMain.unitLabel)} ×{" "}
                    {order.mealQuantity ?? 1}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatIncludedPrice(mealMain.unitPrice * (order.mealQuantity ?? 1))}
                  </span>
                </div>
                <OrderLineRatings
                  line={mealMain}
                  order={order}
                  ratingSummaries={ratingSummaries}
                  ratingsLoadFailed={ratingsLoadFailed}
                />
              </li>
              {mealSides.map((side) => (
                <li key={`${side.name}-${side.providerMenuItemId ?? side.unitLabel}`} className="space-y-2">
                  <div className="flex justify-between gap-4">
                    <span className="text-foreground">
                      {formatMenuItemLabel(side.name, side.unitLabel)}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatIncludedPrice(side.unitPrice)}
                    </span>
                  </div>
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
                <div className="flex justify-between gap-4">
                  <span className="min-w-0 text-foreground">
                    {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                    {item.unitPrice > 0 ? (
                      <span className="text-muted">{` · ${formatPrice(item.unitPrice)} each`}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-foreground">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </div>
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
          <p className="text-sm text-foreground">
            <span className="font-medium text-muted">Instructions:</span>{" "}
            {order.specialInstructions.trim()}
          </p>
        ) : null}

        <dl className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted">Order total</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {formatCurrency(order.orderTotal)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:block sm:text-right">
            <dt className="text-muted">Status</dt>
            <dd className="font-medium text-foreground">{order.statusLabel}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
