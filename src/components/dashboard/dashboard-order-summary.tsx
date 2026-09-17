import type { DeliveryOrderSummary } from "@/lib/staff-ordering";
import { formatDisplayDate } from "@/lib/ordering-ui";
import {
  formatMenuItemLabel,
  formatOrderLineLabel,
} from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/format";

export function DashboardOrderSummary({ order }: { order: DeliveryOrderSummary }) {
  const isCancelled = order.status === "cancelled";
  const mealItems = order.items.filter(
    (item) => item.itemType === "main" || item.itemType === "side",
  );
  const standaloneItems = order.items.filter((item) => item.itemType === "standalone");
  const previewItems = [...mealItems, ...standaloneItems].slice(0, 4);
  const remaining = order.items.length - previewItems.length;

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-foreground">{order.providerName ?? "Lunch order"}</p>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-xs text-muted">
        Delivery {formatDisplayDate(order.deliveryDate)}
        {order.office_location_name ? ` · ${order.office_location_name}` : ""}
      </p>

      {!isCancelled && (
        <>
          {order.mealQuantity && mealItems.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-muted">
              {formatMealBundleLabel(order.mealQuantity)}
            </p>
          ) : null}
          <ul className="mt-1 space-y-0.5 text-muted">
            {previewItems.map((item) => (
              <li key={`${order.id}-${item.name}-${item.unitLabel}`} className="truncate">
                {item.itemType === "standalone"
                  ? formatOrderLineLabel(item.name, item.unitLabel, item.quantity)
                  : formatMenuItemLabel(item.name, item.unitLabel)}
              </li>
            ))}
            {remaining > 0 ? <li className="text-xs">+{remaining} more</li> : null}
          </ul>
          {order.total > 0 ? (
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(order.total)}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
