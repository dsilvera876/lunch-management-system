"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  RECONCILIATION_FILTERS,
  canReportIssue,
  canToggleDeliveryCheckbox,
  countsForReconciliationFilter,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import {
  applyDeliveriesToolbarFilters,
  captureDeliveryToggleSnapshot,
  computeDeliveryProgress,
  filterDeliveriesOrders,
  formatDeliveryOrderDescription,
  groupOrdersByOfficeLocation,
  patchDeliveryOrder,
  patchFromDelivered,
  patchFromRevertedToPending,
  replaceDeliveriesUrlInHistory,
  type DeliveriesFilterState,
} from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  markOrderDeliveredMutation,
  revertOrderDeliveryToPendingMutation,
  type DeliveryMutationResult,
} from "@/app/admin/deliveries/mutations";
import { DeliveryIssuePanel } from "@/components/admin/delivery-issue-panel";
import { DeliveriesPageHeader } from "@/components/admin/deliveries-page-header";
import {
  DELIVERY_TOGGLE_ERROR_MESSAGE,
  deliveriesOfficeCardClassName,
  deliveryStatusBadgeClassName,
  formatDeliveryStatusBadgeLabel,
  resolveDeliveryStatusBadgeVariant,
} from "@/lib/deliveries-presentation";
import { linkButtonClass } from "@/components/ui/button";
import { selectClassName } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_LABELS: Record<ReconciliationFilter, string> = {
  all: "All",
  pending: "Pending",
  delivered: "Delivered",
  issues: "Issues",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

type Props = {
  initialOrders: OperationalOrder[];
  initialFilters: DeliveriesFilterState;
  providers: Array<{ id: string; name: string }>;
  locationNames: string[];
  canReconcile: boolean;
  deliveryDateLabel: string;
};

function buildPrintHref(deliveryDate: string, providerId?: string): string {
  if (providerId) {
    return `/admin/deliveries/provider/${providerId}/print?deliveryDate=${deliveryDate}`;
  }

  return `/admin/deliveries/print?deliveryDate=${deliveryDate}`;
}

function DeliveryCheckbox({
  order,
  canReconcile,
  checked,
  onToggle,
}: {
  order: OperationalOrder;
  canReconcile: boolean;
  checked: boolean;
  onToggle: (nextChecked: boolean) => void;
}) {
  if (!canReconcile || !canToggleDeliveryCheckbox(order)) {
    const readOnlyChecked =
      order.deliveryState === "delivered" ||
      (order.deliveryState === "resolved" &&
        order.financialDisposition === "chargeable");

    return (
      <span className="inline-flex min-h-8 min-w-8 items-center justify-center text-sm text-muted">
        {readOnlyChecked ? "✓" : order.deliveryState === "issue_open" ? "⚠" : "—"}
      </span>
    );
  }

  return (
    <input
      type="checkbox"
      aria-label={`Mark ${order.employeeName} delivered`}
      checked={checked}
      onChange={(event) => onToggle(event.target.checked)}
      className="size-4 rounded border-border text-primary focus:ring-primary/30"
    />
  );
}

function DeliveryStatusBadge({ order }: { order: OperationalOrder }) {
  const variant = resolveDeliveryStatusBadgeVariant(order);
  const label = formatDeliveryStatusBadgeLabel(order);

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${deliveryStatusBadgeClassName(variant)}`}
    >
      {label}
    </span>
  );
}

function DesktopOrderCell({ order }: { order: OperationalOrder }) {
  const description = formatDeliveryOrderDescription(order);

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{description.primaryLine}</p>
      {description.detailLine ? (
        <p className="text-xs text-muted">{description.detailLine}</p>
      ) : null}
    </div>
  );
}

function DesktopQtyCell({ order }: { order: OperationalOrder }) {
  const description = formatDeliveryOrderDescription(order);

  return (
    <div className="text-center text-sm tabular-nums text-muted">
      {description.quantityLabel}
    </div>
  );
}

function DeliveryRow({
  order,
  canReconcile,
  showProviderColumn,
  rowError,
  onToggleDelivered,
  onIssue,
}: {
  order: OperationalOrder;
  canReconcile: boolean;
  showProviderColumn: boolean;
  rowError: string | null;
  onToggleDelivered: (nextChecked: boolean) => void;
  onIssue: () => void;
}) {
  const issueOpen = order.deliveryState === "issue_open";
  const deliveredChecked = order.deliveryState === "delivered";
  const issueActionLabel = issueOpen ? "View / Edit issue" : "Issue";

  return (
    <>
      <tr className="hidden border-b border-border last:border-b-0 md:table-row">
        <td className="px-2 py-1.5 align-middle">
          <DeliveryCheckbox
            order={order}
            canReconcile={canReconcile}
            checked={deliveredChecked}
            onToggle={onToggleDelivered}
          />
        </td>
        <td className="px-2 py-1.5 align-middle text-sm font-medium text-foreground">
          {order.employeeName}
          {order.isLateOrder ? (
            <span className="ml-1 rounded bg-muted/40 px-1 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted">
              Late
            </span>
          ) : null}
        </td>
        {showProviderColumn ? (
          <td className="px-2 py-1.5 align-middle text-sm text-muted">
            {order.providerName}
          </td>
        ) : null}
        <td className="px-2 py-1.5 align-top">
          <DesktopOrderCell order={order} />
        </td>
        <td className="w-12 px-2 py-1.5 align-top">
          <DesktopQtyCell order={order} />
        </td>
        <td className="px-2 py-1.5 align-middle">
          <DeliveryStatusBadge order={order} />
        </td>
        <td className="px-2 py-1.5 align-middle text-right">
          {(canReportIssue(order) || issueOpen) && canReconcile ? (
            <button
              type="button"
              onClick={onIssue}
              className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
            >
              {issueActionLabel}
            </button>
          ) : null}
        </td>
      </tr>
      {rowError ? (
        <tr className="hidden md:table-row">
          <td
            colSpan={showProviderColumn ? 7 : 6}
            className="border-b border-border px-2 pb-2 text-xs text-red-700"
          >
            {rowError}
          </td>
        </tr>
      ) : null}

      <tr className="md:hidden">
        <td colSpan={showProviderColumn ? 7 : 6} className="border-b border-border px-2 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {order.employeeName}
                </p>
                <DeliveryCheckbox
                  order={order}
                  canReconcile={canReconcile}
                  checked={deliveredChecked}
                  onToggle={onToggleDelivered}
                />
              </div>
              <p className="text-xs text-muted">{order.providerName}</p>
              <DesktopOrderCell order={order} />
              <DeliveryStatusBadge order={order} />
              {rowError ? <p className="text-xs text-red-700">{rowError}</p> : null}
            </div>
            {(canReportIssue(order) || issueOpen) && canReconcile ? (
              <button
                type="button"
                onClick={onIssue}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
              >
                {issueActionLabel}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    </>
  );
}

export function DeliveriesWorkspace({
  initialOrders,
  initialFilters,
  providers,
  locationNames,
  canReconcile,
  deliveryDateLabel,
}: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [filters, setFilters] = useState<DeliveriesFilterState>(initialFilters);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const toggleVersionRef = useRef(new Map<string, number>());

  const syncFilters = useCallback((next: DeliveriesFilterState) => {
    setFilters(next);
    replaceDeliveriesUrlInHistory(next);
  }, []);

  const toolbarOrders = useMemo(
    () => applyDeliveriesToolbarFilters(orders, filters),
    [orders, filters],
  );

  const statusCounts = useMemo(
    () => countsForReconciliationFilter(toolbarOrders),
    [toolbarOrders],
  );

  const filteredOrders = useMemo(
    () => filterDeliveriesOrders(toolbarOrders, filters.reconciliationStatus),
    [toolbarOrders, filters.reconciliationStatus],
  );

  const officeGroups = useMemo(
    () => groupOrdersByOfficeLocation(filteredOrders),
    [filteredOrders],
  );

  const overallProgress = useMemo(() => computeDeliveryProgress(orders), [orders]);
  const issueOrder = orders.find((order) => order.id === issueOrderId) ?? null;
  const showProviderColumn = !filters.providerId;

  const applyMutation = (result: DeliveryMutationResult) => {
    if (!result.success) {
      return false;
    }

    setOrders((current) => patchDeliveryOrder(current, result.patch));
    setIssueOrderId(null);
    return true;
  };

  const clearRowError = (orderId: string) => {
    setRowErrors((current) => {
      if (!current[orderId]) {
        return current;
      }

      const next = { ...current };
      delete next[orderId];
      return next;
    });
  };

  const handleDeliveryToggle = (orderId: string, nextChecked: boolean) => {
    if (!canReconcile) {
      return;
    }

    let rollbackSnapshot: ReturnType<typeof captureDeliveryToggleSnapshot> | null =
      null;

    setOrders((current) => {
      const order = current.find((entry) => entry.id === orderId);
      if (!order || !canToggleDeliveryCheckbox(order)) {
        return current;
      }

      rollbackSnapshot = captureDeliveryToggleSnapshot(order);
      const optimisticPatch = nextChecked
        ? patchFromDelivered(order, getJamaicaTodayDate())
        : patchFromRevertedToPending(order);

      return patchDeliveryOrder(current, optimisticPatch);
    });

    if (!rollbackSnapshot) {
      return;
    }

    const version = (toggleVersionRef.current.get(orderId) ?? 0) + 1;
    toggleVersionRef.current.set(orderId, version);
    clearRowError(orderId);

    void (async () => {
      const result = nextChecked
        ? await markOrderDeliveredMutation({ orderId })
        : await revertOrderDeliveryToPendingMutation({ orderId });

      if (toggleVersionRef.current.get(orderId) !== version) {
        return;
      }

      if (!result.success) {
        setOrders((current) => patchDeliveryOrder(current, rollbackSnapshot!));
        setRowErrors((current) => ({
          ...current,
          [orderId]: DELIVERY_TOGGLE_ERROR_MESSAGE,
        }));
        return;
      }

      setOrders((current) => patchDeliveryOrder(current, result.patch));
    })();
  };

  return (
    <div className="space-y-3">
      <DeliveriesPageHeader
        deliveryDateLabel={deliveryDateLabel}
        reconciled={overallProgress.reconciled}
        total={overallProgress.total}
      />

      <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3">
        <label className="text-xs text-muted">
          Provider
          <select
            value={filters.providerId}
            onChange={(event) =>
              syncFilters({ ...filters, providerId: event.target.value })
            }
            className={`${selectClassName} mt-0.5 min-w-[9rem] text-sm`}
          >
            <option value="">All</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Office
          <select
            value={filters.officeLocation}
            onChange={(event) =>
              syncFilters({ ...filters, officeLocation: event.target.value })
            }
            className={`${selectClassName} mt-0.5 min-w-[9rem] text-sm`}
          >
            <option value="">All</option>
            {locationNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <Link
          href={buildPrintHref(filters.deliveryDate, filters.providerId || undefined)}
          className={`${linkButtonClass("secondary")} ml-auto h-9 px-3 text-sm`}
        >
          Print Delivery Sheet
        </Link>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {RECONCILIATION_FILTERS.map((filter) => {
          const selected = filters.reconciliationStatus === filter;
          const count = statusCounts[filter];

          return (
            <button
              key={filter}
              type="button"
              onClick={() => syncFilters({ ...filters, reconciliationStatus: filter })}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted hover:bg-muted/50"
              }`}
            >
              {STATUS_LABELS[filter]} {count}
            </button>
          );
        })}
      </div>

      {officeGroups.length === 0 ? (
        <EmptyState
          title="No orders match these filters"
          description="Try another status filter or adjust provider or office."
        />
      ) : (
        officeGroups.map((office) => (
          <section key={office.name} className={deliveriesOfficeCardClassName}>
            <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold text-foreground">
                {office.name} · {office.orders.length}{" "}
                {office.orders.length === 1 ? "order" : "orders"}
              </h2>
              <p className="text-xs tabular-nums text-muted">
                {office.progress.reconciled} / {office.progress.total} reconciled
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="hidden w-full min-w-[760px] border-collapse md:table">
                <thead className="bg-muted/15 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-10 px-2 py-1.5 font-medium">✓</th>
                    <th className="px-2 py-1.5 font-medium">Staff</th>
                    {showProviderColumn ? (
                      <th className="px-2 py-1.5 font-medium">Provider</th>
                    ) : null}
                    <th className="px-2 py-1.5 font-medium">Order</th>
                    <th className="w-12 px-2 py-1.5 text-center font-medium">Qty</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    <th className="px-2 py-1.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {office.orders.map((order) => (
                    <DeliveryRow
                      key={order.id}
                      order={order}
                      canReconcile={canReconcile}
                      showProviderColumn={showProviderColumn}
                      rowError={rowErrors[order.id] ?? null}
                      onToggleDelivered={(nextChecked) =>
                        handleDeliveryToggle(order.id, nextChecked)
                      }
                      onIssue={() => setIssueOrderId(order.id)}
                    />
                  ))}
                </tbody>
              </table>

              <table className="w-full border-collapse md:hidden">
                <tbody>
                  {office.orders.map((order) => (
                    <DeliveryRow
                      key={order.id}
                      order={order}
                      canReconcile={canReconcile}
                      showProviderColumn={showProviderColumn}
                      rowError={rowErrors[order.id] ?? null}
                      onToggleDelivered={(nextChecked) =>
                        handleDeliveryToggle(order.id, nextChecked)
                      }
                      onIssue={() => setIssueOrderId(order.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <DeliveryIssuePanel
        order={issueOrder}
        open={issueOrderId !== null}
        onClose={() => setIssueOrderId(null)}
        onMutated={applyMutation}
      />
    </div>
  );
}
