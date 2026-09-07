import Link from "next/link";
import type { DeliveryOrderSummary } from "@/lib/staff-ordering";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export function OrderSummaryCard({ order }: { order: DeliveryOrderSummary }) {
  return (
    <Card padding="sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">
              {order.providerName ?? "Lunch order"}
            </h3>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted">
            Delivery {order.deliveryDate}
          </p>
        </div>
        <Link
          href={`/lunch/orders/${order.id}`}
          className={linkButtonClass("secondary")}
        >
          View order
        </Link>
      </div>

      <ul className="mt-4 space-y-1 text-sm text-foreground">
        {order.items.map((item) => (
          <li key={`${order.id}-${item.name}`}>
            {item.name} × {item.quantity}
          </li>
        ))}
      </ul>

      {order.total > 0 && (
        <p className="mt-3 text-sm font-medium text-foreground">
          Total: ${formatCurrency(order.total)}
        </p>
      )}
    </Card>
  );
}
