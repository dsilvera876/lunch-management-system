"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatHumanDate } from "@/lib/format";
import {
  buildOperationalOrderDetailGroups,
  type OperationalOrder,
} from "@/lib/operational-orders";
import { formatOrderLineLabel } from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import {
  getDeliveryIssueLabel,
  getDeliveryResolutionLabel,
  getOperationalDisplayState,
  canManageOpenIssue,
  canReportIssue,
} from "@/lib/delivery-reconciliation";
import {
  formatOrderHistoryCompactOrderLines,
  formatOrderHistoryTimelineDate,
  formatOrderHistoryTimelineProviderOffice,
} from "@/lib/order-history";
import { loadEmployeeRecentOrderHistory } from "@/app/admin/orders/load-employee-recent-orders";
import {
  deliveryStatusBadgeClassName,
  orderHistoryTimelineDotClassName,
  resolveDeliveryStatusBadgeVariant,
} from "@/lib/deliveries-presentation";
import type { DeliveryMutationResult } from "@/app/admin/deliveries/mutations";
import { DeliveryIssuePanelForm } from "@/components/admin/delivery-issue-panel";
import type { DeliveryOrderPatch } from "@/lib/deliveries";

type Props = {
  order: OperationalOrder | null;
  open: boolean;
  canReconcile: boolean;
  onClose: () => void;
  onOrderPatched: (patch: DeliveryOrderPatch) => void;
  onEmployeeRecentOrdersChange: (orders: OperationalOrder[]) => void;
  onSelectOrderId: (orderId: string) => void;
};

function MetadataSummaryField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

function EmployeeRecentOrderHistorySection({
  profileId,
  employeeName,
  currentOrderId,
  onLoaded,
  onSelectHistoryOrder,
}: {
  profileId: string;
  employeeName: string;
  currentOrderId: string;
  onLoaded: (orders: OperationalOrder[]) => void;
  onSelectHistoryOrder: (orderId: string) => void;
}) {
  const [orders, setOrders] = useState<OperationalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadEmployeeRecentOrderHistory(profileId).then((result) => {
      if (cancelled) {
        return;
      }

      setLoading(false);

      if (!result.ok) {
        setError(result.error);
        setOrders([]);
        onLoaded([]);
        return;
      }

      setOrders(result.orders);
      onLoaded(result.orders);
    });

    return () => {
      cancelled = true;
      onLoaded([]);
    };
  }, [profileId, onLoaded]);

  if (loading) {
    return <p className="text-sm text-muted">Loading recent order history…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (orders.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Employee order history</h3>
      <p className="mt-0.5 text-xs text-muted">Recent orders for {employeeName}</p>
      <ol className="relative mt-2.5">
        {orders.map((entry, index) => {
          const shortLines = formatOrderHistoryCompactOrderLines(entry);
          const orderDescription = shortLines.join(" + ");
          const entryBadge = resolveDeliveryStatusBadgeVariant(entry);
          const dotClass = orderHistoryTimelineDotClassName(entryBadge);
          const isLast = index === orders.length - 1;
          const isSelected = entry.id === currentOrderId;
          const providerOffice = formatOrderHistoryTimelineProviderOffice(
            entry.providerName,
            entry.officeLocationName,
          );

          return (
            <li key={entry.id} className="relative flex gap-2 last:pb-0">
              <div
                className={`relative flex w-2.5 shrink-0 justify-center self-stretch ${isLast ? "" : "min-h-[3.25rem]"}`}
              >
                {!isLast ? (
                  <span
                    aria-hidden
                    className="absolute top-[0.55rem] bottom-0 left-1/2 w-px -translate-x-1/2 bg-border/80"
                  />
                ) : null}
                <span
                  aria-hidden
                  className={`relative z-[1] mt-1.5 shrink-0 rounded-full ring-2 ring-surface ${
                    isSelected ? "size-2.5 ring-primary/35" : "size-2"
                  } ${dotClass}`}
                />
              </div>
              <button
                type="button"
                onClick={() => onSelectHistoryOrder(entry.id)}
                aria-current={isSelected ? "true" : undefined}
                className={`mb-1.5 min-w-0 flex-1 rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-primary/[0.04] ${
                  isSelected
                    ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/25"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 text-sm ${isSelected ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
                  >
                    {formatOrderHistoryTimelineDate(entry.deliveryDate)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {providerOffice}
                  </span>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-none ring-1 ring-inset ${deliveryStatusBadgeClassName(entryBadge)}`}
                  >
                    {getOperationalDisplayState(entry)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate text-xs ${isSelected ? "font-medium text-slate-800" : "text-foreground/90"}`}
                  title={orderDescription}
                >
                  {orderDescription}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OrderItemsList({ order }: { order: OperationalOrder }) {
  const groups = buildOperationalOrderDetailGroups(order);

  return (
    <div className="space-y-3 text-sm">
      {groups.mealQuantity && groups.mains.length > 0 ? (
        <div>
          <p className="font-semibold text-foreground">
            {formatMealBundleLabel(groups.mealQuantity)}
          </p>
          <ul className="mt-2 space-y-1 text-foreground/90">
            {[...groups.mains, ...groups.sides].map((item) => (
              <li key={`${item.name}-${item.itemType}`}>{item.name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.mains.length > 0 && !groups.mealQuantity ? (
        <ul className="space-y-0.5">
          {groups.mains.map((item) => (
            <li key={item.name}>
              {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
            </li>
          ))}
        </ul>
      ) : null}

      {groups.sides.length > 0 && !groups.mealQuantity ? (
        <ul className="space-y-0.5 text-muted">
          {groups.sides.map((item) => (
            <li key={item.name}>
              {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
            </li>
          ))}
        </ul>
      ) : null}

      {Object.entries(groups.standaloneByCategory).map(([category, items]) => (
        <div key={category}>
          <p className="font-medium">{category}</p>
          <ul className="mt-0.5 space-y-0.5 text-muted">
            {items.map((item) => (
              <li key={item.name}>
                {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function OrderHistoryDetailDrawer({
  order,
  open,
  canReconcile,
  onClose,
  onOrderPatched,
  onEmployeeRecentOrdersChange,
  onSelectOrderId,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSelectHistoryOrder = useCallback(
    (orderId: string) => {
      if (orderId === order?.id) {
        return;
      }

      onSelectOrderId(orderId);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [onSelectOrderId, order?.id],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !order) {
    return null;
  }

  const badgeVariant = resolveDeliveryStatusBadgeVariant(order);
  const showIssueForm =
    canReconcile &&
    (canManageOpenIssue(order.deliveryState) ||
      (canReportIssue(order) && order.deliveryState !== "issue_open"));

  const handleMutated = (result: DeliveryMutationResult) => {
    if (!result.success) {
      return false;
    }

    onOrderPatched(result.patch);
    onClose();
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <button
        type="button"
        aria-label="Close order details"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      <aside className="relative flex h-[min(92vh,100%)] w-full max-w-xl flex-col overflow-hidden border border-border bg-surface shadow-xl sm:rounded-l-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Order details</h2>
            <p className="truncate text-sm text-muted">{order.employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-muted/40"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollContainerRef}
            className="flex-1 space-y-5 overflow-y-auto px-4 py-4"
          >
            <div className="grid gap-4 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-4 sm:grid-cols-2">
              <MetadataSummaryField label="Provider">{order.providerName}</MetadataSummaryField>
              <MetadataSummaryField label="Office">
                {order.officeLocationName}
              </MetadataSummaryField>
              <MetadataSummaryField label="Order date">
                {formatHumanDate(order.orderDate)}
              </MetadataSummaryField>
              <MetadataSummaryField label="Scheduled delivery">
                {formatHumanDate(order.deliveryDate)}
              </MetadataSummaryField>
              <MetadataSummaryField label="Actual delivery">
                {order.actualDeliveryDate
                  ? formatHumanDate(order.actualDeliveryDate)
                  : "—"}
              </MetadataSummaryField>
              <MetadataSummaryField label="Status">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${deliveryStatusBadgeClassName(badgeVariant)}`}
                >
                  {getOperationalDisplayState(order)}
                </span>
              </MetadataSummaryField>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">Order</h3>
              <div className="mt-3">
                <OrderItemsList order={order} />
              </div>
            </div>

            {order.specialInstructions?.trim() ? (
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3 text-sm">
                <p className="text-xs font-medium text-muted">Special instructions</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium text-slate-800">
                  {order.specialInstructions}
                </p>
              </div>
            ) : null}

            <EmployeeRecentOrderHistorySection
              key={order.profileId}
              profileId={order.profileId}
              employeeName={order.employeeName}
              currentOrderId={order.id}
              onLoaded={onEmployeeRecentOrdersChange}
              onSelectHistoryOrder={handleSelectHistoryOrder}
            />

            {(order.deliveryIssueType ||
              order.deliveryResolutionType ||
              order.hrDeliveryNotes) &&
            !showIssueForm ? (
              <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-sm">
                <h3 className="text-sm font-semibold text-foreground">Delivery outcome</h3>
                {order.deliveryIssueType ? (
                  <p>
                    <span className="font-medium text-muted">Issue:</span>{" "}
                    {getDeliveryIssueLabel(order.deliveryIssueType)}
                  </p>
                ) : null}
                {order.deliveryResolutionType ? (
                  <p>
                    <span className="font-medium text-muted">Resolution plan:</span>{" "}
                    {getDeliveryResolutionLabel(order.deliveryResolutionType)}
                  </p>
                ) : null}
                {order.hrDeliveryNotes?.trim() ? (
                  <p className="whitespace-pre-wrap text-muted">{order.hrDeliveryNotes}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {showIssueForm ? (
            <div className="border-t border-border">
              <DeliveryIssuePanelForm
                key={order.id}
                order={order}
                onClose={onClose}
                onMutated={handleMutated}
                embedded
              />
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
