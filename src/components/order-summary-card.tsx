import Link from "next/link";
import type { DeliveryOrderSummary } from "@/lib/staff-ordering";
import { formatDisplayDate } from "@/lib/ordering-ui";
import {
  formatMenuItemLabel,
  formatOrderLineLabel,
} from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export function OrderSummaryCard({ order }: { order: DeliveryOrderSummary }) {
  const isCancelled = order.status === "cancelled";
  const mealItems = order.items.filter(
    (item) => item.itemType === "main" || item.itemType === "side",
  );
  const standaloneItems = order.items.filter((item) => item.itemType === "standalone");

  return (
    <Card
      padding="sm"
      className={isCancelled ? "opacity-75 ring-1 ring-slate-200" : undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">
              {order.providerName ?? "Lunch order"}
            </h3>
            <StatusBadge status={order.status} />
          </div>
          <dl className="grid gap-1 text-sm text-muted">
            {order.orderDate && (
              <div>
                <dt className="sr-only">Order date</dt>
                <dd>Ordered {formatDisplayDate(order.orderDate)}</dd>
              </div>
            )}
            <div>
              <dt className="sr-only">Delivery date</dt>
              <dd>Delivery {formatDisplayDate(order.deliveryDate)}</dd>
            </div>
          </dl>
        </div>
        <Link
          href={`/lunch/orders/${order.id}`}
          className={`${linkButtonClass("secondary")} shrink-0`}
        >
          View order
        </Link>
      </div>

      {!isCancelled && (
        <>
          {order.mealQuantity && mealItems.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {formatMealBundleLabel(order.mealQuantity)}
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {mealItems.map((item) => (
                  <li key={`${order.id}-${item.name}-${item.unitLabel}-meal`}>
                    {formatMenuItemLabel(item.name, item.unitLabel)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {standaloneItems.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {order.mealQuantity ? "Optional items" : "Items"}
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {standaloneItems.map((item) => (
                  <li key={`${order.id}-${item.name}-${item.unitLabel}`}>
                    {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {order.specialInstructions && (
            <p className="mt-3 text-sm text-muted">
              <span className="font-medium text-foreground">Instructions:</span>{" "}
              {order.specialInstructions}
            </p>
          )}

          {order.total > 0 && (
            <p className="mt-3 text-sm font-medium text-foreground">
              Total: {formatCurrency(order.total)}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
