import Link from "next/link";
import { formatMealBundleLabel } from "@/lib/order-payload";
import {
  buildOperationalOrderDetailGroups,
  type OperationalOrder,
} from "@/lib/operational-orders";
import { formatOrderLineLabel } from "@/lib/menu-items";
import {
  DeliveryReconciliationActions,
  ReconciliationBadge,
  type SnapshotMenuItem,
} from "@/components/admin/delivery-reconciliation-actions";

type Props = {
  order: OperationalOrder;
  canReconcile: boolean;
  returnTo: string;
  snapshotMenuItems?: SnapshotMenuItem[];
  subdued?: boolean;
};

export function OperationalOrderCard({
  order,
  canReconcile,
  returnTo,
  snapshotMenuItems = [],
  subdued = false,
}: Props) {
  const groups = buildOperationalOrderDetailGroups(order);
  const isCancelled = order.status === "cancelled";
  const isIssueOpen = order.deliveryState === "issue_open";
  const isDelivered =
    order.deliveryState === "delivered" || order.deliveryState === "resolved";

  return (
    <article
      className={`rounded-lg border border-border bg-surface p-4 ${
        isCancelled
          ? "opacity-60"
          : isIssueOpen
            ? "ring-2 ring-rose-200"
            : isDelivered
              ? "ring-1 ring-emerald-200"
              : ""
      } ${subdued ? "print:break-inside-avoid" : ""}`}
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-foreground">
              {order.employeeName}
              {!subdued && order.officeLocationName
                ? ` — ${order.officeLocationName}`
                : ""}
            </h4>
            <ReconciliationBadge order={order} />
          </div>
          {!subdued && order.officeLocationAddress && (
            <p className="text-sm text-muted">{order.officeLocationAddress}</p>
          )}
          {!subdued && (
            <p className="text-sm text-muted">
              Order date {order.orderDate} · Scheduled delivery {order.deliveryDate}
              {order.actualDeliveryDate
                ? ` · Actual delivery ${order.actualDeliveryDate}`
                : ""}
            </p>
          )}
        </div>

        {!subdued && (
          <DeliveryReconciliationActions
            order={order}
            returnTo={returnTo}
            canReconcile={canReconcile}
            snapshotMenuItems={snapshotMenuItems}
          />
        )}
      </div>

      <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
        {groups.mealQuantity && groups.mains.length > 0 && (
          <div>
            <p className="font-semibold">{formatMealBundleLabel(groups.mealQuantity)}</p>
            <ul className="mt-1 space-y-1 text-muted">
              {[...groups.mains, ...groups.sides].map((item) => (
                <li key={`${item.name}-${item.itemType}`}>{item.name}</li>
              ))}
            </ul>
          </div>
        )}

        {groups.mains.length > 0 && !groups.mealQuantity && (
          <div>
            <p className="font-semibold">Mains</p>
            <ul className="mt-1 space-y-1">
              {groups.mains.map((item) => (
                <li key={item.name}>
                  {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {groups.sides.length > 0 && !groups.mealQuantity && (
          <div>
            <p className="font-semibold">Sides</p>
            <ul className="mt-1 space-y-1">
              {groups.sides.map((item) => (
                <li key={item.name}>
                  {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.entries(groups.standaloneByCategory).map(([category, items]) => (
          <div key={category}>
            <p className="font-semibold">{category}</p>
            <ul className="mt-1 space-y-1">
              {items.map((item) => (
                <li key={item.name}>
                  {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {order.specialInstructions?.trim() && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-2 ring-inset ring-amber-300 print:ring-amber-400">
          <p className="font-semibold uppercase tracking-wide text-xs">
            Special instructions
          </p>
          <p className="mt-1 whitespace-pre-wrap">{order.specialInstructions}</p>
        </div>
      )}

      {subdued && (
        <div className="mt-4 border-t border-dashed border-border pt-3 text-sm print:block">
          <div className="flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-2">
              <span className="inline-block h-4 w-4 border border-border" />
              Delivered
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="inline-block h-4 w-4 border border-border" />
              Issue
            </label>
          </div>
          {(order.deliveryState === "delivered" ||
            order.deliveryState === "resolved" ||
            order.deliveryState === "issue_open") && (
            <p className="mt-2 text-xs text-muted">
              Current state: {order.deliveryState.replace("_", " ")}
            </p>
          )}
          <div className="mt-3 h-8 border-b border-border text-xs text-muted">
            HR notes:
          </div>
        </div>
      )}
    </article>
  );
}

type ProviderSectionProps = {
  providerId: string;
  providerName: string;
  officeSummaries: Array<{ name: string; orderCount: number }>;
  preparationSections: Array<{
    label: string;
    lines: Array<{ name: string; quantity: number; unitLabel: string }>;
  }>;
  offices: Array<{
    name: string;
    orders: OperationalOrder[];
  }>;
  canReconcile: boolean;
  returnTo: string;
  deliveryDate: string;
  snapshotMenuItemsByLunchDay: Record<string, SnapshotMenuItem[]>;
};

export function ProviderOperationalSection({
  providerId,
  providerName,
  officeSummaries,
  preparationSections,
  offices,
  canReconcile,
  returnTo,
  deliveryDate,
  snapshotMenuItemsByLunchDay,
}: ProviderSectionProps) {
  return (
    <section className="space-y-6 print:break-inside-avoid">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{providerName}</h2>
          {officeSummaries.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {officeSummaries.map((summary) => (
                <li key={summary.name}>
                  {summary.name} — {summary.orderCount}{" "}
                  {summary.orderCount === 1 ? "order" : "orders"}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href={`/admin/orders/provider/${providerId}/print?deliveryDate=${deliveryDate}`}
          className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40 print:hidden"
        >
          Print Delivery Sheet
        </Link>
      </div>

      {preparationSections.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Preparation Summary
          </h3>
          <p className="mt-1 text-xs text-muted">
            Excludes cancelled and waived orders. Open issues remain included until closed.
          </p>
          <div className="mt-3 space-y-4">
            {preparationSections.map((section) => (
              <div key={section.label}>
                <p className="font-semibold text-foreground">{section.label}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {section.lines.map((line) => (
                    <li key={`${section.label}-${line.name}-${line.unitLabel}`}>
                      {line.name}
                      {line.unitLabel && line.unitLabel !== "Each"
                        ? ` (${line.unitLabel})`
                        : ""}{" "}
                      ×{line.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {offices.map((office) => (
        <div key={office.name} className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">{office.name}</h3>
          <div className="space-y-3">
            {office.orders.map((order) => (
              <OperationalOrderCard
                key={order.id}
                order={order}
                canReconcile={canReconcile}
                returnTo={returnTo}
                snapshotMenuItems={snapshotMenuItemsByLunchDay[order.lunchDayId] ?? []}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
