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

type Props = {
  order: StaffProviderOrder;
  showViewLink?: boolean;
};

function formatIncludedPrice(price: number): string {
  return price > 0 ? formatCurrency(price) : "Included";
}

export function ProviderOrderSection({ order, showViewLink = true }: Props) {
  const { mealMain, mealSides, standalone } = getMealAndStandaloneLines(order.lines);

  return (
    <section className="border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{order.providerName}</h4>
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
              <li className="flex justify-between gap-4">
                <span className="font-medium text-foreground">
                  {formatMenuItemLabel(mealMain.name, mealMain.unitLabel)} ×{" "}
                  {order.mealQuantity ?? 1}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatIncludedPrice(mealMain.unitPrice * (order.mealQuantity ?? 1))}
                </span>
              </li>
              {mealSides.map((side) => (
                <li key={side.name} className="flex justify-between gap-4">
                  <span className="text-foreground">
                    {formatMenuItemLabel(side.name, side.unitLabel)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatIncludedPrice(side.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {standalone.length > 0 ? (
          <ul className="space-y-2">
            {standalone.map((item) => (
              <li key={`${item.name}-${item.unitLabel}`} className="flex justify-between gap-4">
                <span className="min-w-0 text-foreground">
                  {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                  {item.unitPrice > 0 ? (
                    <span className="text-muted">{` · ${formatPrice(item.unitPrice)} each`}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums font-medium text-foreground">
                  {formatCurrency(item.lineTotal)}
                </span>
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
