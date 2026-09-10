"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  RECONCILIATION_FILTERS,
  canMarkDelivered,
  canReportIssue,
  getOperationalDisplayState,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import {
  applyDeliveriesFilters,
  computeDeliveryProgress,
  replaceDeliveriesUrlInHistory,
  formatMobileOrderLines,
  getDeliveryDisplayLinePairs,
  groupOrdersByOfficeLocation,
  patchDeliveryOrder,
  type DeliveriesFilterState,
} from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import { markOrderDeliveredMutation } from "@/app/admin/deliveries/mutations";
import type { DeliveryMutationResult } from "@/app/admin/deliveries/mutations";
import { DeliveryIssuePanel } from "@/components/admin/delivery-issue-panel";
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

const DESKTOP_LINE_CLASS = "text-sm leading-tight";

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

function rowTone(order: OperationalOrder): string {
  if (order.status === "cancelled") {
    return "opacity-60";
  }

  if (order.deliveryState === "delivered" || order.deliveryState === "resolved") {
    return "bg-emerald-50/40";
  }

  if (order.deliveryState === "issue_open") {
    return "bg-rose-50/50";
  }

  return "";
}

function DeliveredControl({
  order,
  canReconcile,
  pending,
  onDeliver,
}: {
  order: OperationalOrder;
  canReconcile: boolean;
  pending: boolean;
  onDeliver: () => void;
}) {
  const delivered =
    order.deliveryState === "delivered" ||
    (order.deliveryState === "resolved" && order.financialDisposition === "chargeable");

  if (!canReconcile || !canMarkDelivered(order)) {
    return (
      <span className="inline-flex min-h-9 min-w-9 items-center justify-center text-sm text-muted">
        {delivered ? "✓" : order.deliveryState === "issue_open" ? "⚠" : "—"}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Mark ${order.employeeName} delivered`}
      disabled={pending}
      onClick={onDeliver}
      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-surface text-base hover:bg-muted/30 disabled:opacity-50"
    >
      {pending ? "…" : "☐"}
    </button>
  );
}

function DesktopOrderCell({ order }: { order: OperationalOrder }) {
  const { orderLines } = getDeliveryDisplayLinePairs(order);

  return (
    <div className="space-y-0">
      {orderLines.map((line, index) => (
        <div key={`${line}-${index}`} className={`${DESKTOP_LINE_CLASS} text-foreground`}>
          {line}
        </div>
      ))}
    </div>
  );
}

function DesktopQtyCell({ order }: { order: OperationalOrder }) {
  const { quantityLines } = getDeliveryDisplayLinePairs(order);

  return (
    <div className="space-y-0">
      {quantityLines.map((line, index) => (
        <div
          key={`${line}-${index}`}
          className={`${DESKTOP_LINE_CLASS} text-center tabular-nums text-muted`}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function MobileOrderCell({ order }: { order: OperationalOrder }) {
  const lines = formatMobileOrderLines(order);

  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => (
        <p key={`${line}-${index}`} className="text-sm text-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

function DeliveryRow({
  order,
  canReconcile,
  showProviderColumn,
  rowPending,
  onDeliver,
  onIssue,
}: {
  order: OperationalOrder;
  canReconcile: boolean;
  showProviderColumn: boolean;
  rowPending: boolean;
  onDeliver: () => void;
  onIssue: () => void;
}) {
  const statusLabel = getOperationalDisplayState(order);
  const issueOpen = order.deliveryState === "issue_open";

  return (
    <>
      <tr className={`hidden border-b border-border md:table-row ${rowTone(order)}`}>
        <td className="px-2 py-1.5 align-middle">
          <DeliveredControl
            order={order}
            canReconcile={canReconcile}
            pending={rowPending}
            onDeliver={onDeliver}
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
        {showProviderColumn && (
          <td className="px-2 py-1.5 align-middle text-sm text-muted">{order.providerName}</td>
        )}
        <td className="px-2 py-1.5 align-top">
          <DesktopOrderCell order={order} />
        </td>
        <td className="w-12 px-2 py-1.5 align-top">
          <DesktopQtyCell order={order} />
        </td>
        <td className="px-2 py-1.5 align-middle text-sm text-muted">{statusLabel}</td>
        <td className="px-2 py-1.5 align-middle text-right">
          {(canReportIssue(order) || issueOpen) && canReconcile ? (
            <button
              type="button"
              onClick={onIssue}
              className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
            >
              {issueOpen ? "View" : "Issue"}
            </button>
          ) : null}
        </td>
      </tr>

      <tr className={`md:hidden ${rowTone(order)}`}>
        <td colSpan={showProviderColumn ? 7 : 6} className="border-b border-border px-2 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {order.employeeName}
                  {order.isLateOrder ? (
                    <span className="ml-1 rounded bg-muted/40 px-1 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted">
                      Late
                    </span>
                  ) : null}
                </p>
                <DeliveredControl
                  order={order}
                  canReconcile={canReconcile}
                  pending={rowPending}
                  onDeliver={onDeliver}
                />
              </div>
              <p className="text-xs text-muted">{order.providerName}</p>
              <MobileOrderCell order={order} />
              <p className="text-xs text-muted">{statusLabel}</p>
            </div>
            {(canReportIssue(order) || issueOpen) && canReconcile ? (
              <button
                type="button"
                onClick={onIssue}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10"
              >
                {issueOpen ? "View" : "Issue"}
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
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const syncFilters = useCallback((next: DeliveriesFilterState) => {
    setFilters(next);
    replaceDeliveriesUrlInHistory(next);
  }, []);

  const filteredOrders = useMemo(
    () => applyDeliveriesFilters(orders, filters),
    [orders, filters],
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
      setToast(result.error);
      return;
    }

    setOrders((current) => patchDeliveryOrder(current, result.patch));
    setToast("Saved");
    setIssueOrderId(null);
    setPendingOrderId(null);
  };

  const handleDeliver = (order: OperationalOrder) => {
    if (!canReconcile || !canMarkDelivered(order)) {
      return;
    }

    setPendingOrderId(order.id);
    setToast(null);

    startTransition(async () => {
      const result = await markOrderDeliveredMutation({ orderId: order.id });

      if (!result.success) {
        setPendingOrderId(null);
        setToast(result.error);
        return;
      }

      setOrders((current) => patchDeliveryOrder(current, result.patch));
      setPendingOrderId(null);
      setToast("Delivered");
    });
  };

  const handleProviderChange = (providerId: string) => {
    syncFilters({ ...filters, providerId });
  };

  const handleOfficeChange = (officeLocation: string) => {
    syncFilters({ ...filters, officeLocation });
  };

  const handleStatusChange = (reconciliationStatus: ReconciliationFilter) => {
    syncFilters({ ...filters, reconciliationStatus });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-foreground">
            Deliveries — {deliveryDateLabel}
          </h1>
          <p className="text-sm text-muted">
            {overallProgress.reconciled} / {overallProgress.total} reconciled
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Provider
            <select
              value={filters.providerId}
              onChange={(event) => handleProviderChange(event.target.value)}
              className={`${selectClassName} mt-0.5 min-w-[8rem] text-sm`}
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
              onChange={(event) => handleOfficeChange(event.target.value)}
              className={`${selectClassName} mt-0.5 min-w-[8rem] text-sm`}
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
            className={`${linkButtonClass("secondary")} h-9 px-3 text-sm`}
          >
            Print
          </Link>
        </div>

        <div className="flex flex-wrap gap-1">
          {RECONCILIATION_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => handleStatusChange(filter)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                filters.reconciliationStatus === filter
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted hover:bg-muted/50"
              }`}
            >
              {STATUS_LABELS[filter]}
            </button>
          ))}
        </div>

        {toast && <p className="text-xs text-muted">{toast}</p>}
      </div>

      {officeGroups.length === 0 ? (
        <EmptyState
          title="No orders match these filters"
          description="Try another status filter or adjust the delivery date."
        />
      ) : (
        officeGroups.map((office) => (
          <section key={office.name} className="space-y-1">
            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 bg-background/95 py-1 backdrop-blur-sm">
              <h2 className="text-sm font-semibold text-foreground">
                {office.name} — {office.orders.length}{" "}
                {office.orders.length === 1 ? "order" : "orders"}
              </h2>
              <p className="text-xs text-muted">
                {office.progress.reconciled} / {office.progress.total} reconciled
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="hidden w-full min-w-[720px] border-collapse md:table">
                <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">✓</th>
                    <th className="px-2 py-1.5 font-medium">Staff</th>
                    {showProviderColumn && (
                      <th className="px-2 py-1.5 font-medium">Provider</th>
                    )}
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
                      rowPending={pendingOrderId === order.id}
                      onDeliver={() => handleDeliver(order)}
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
                      rowPending={pendingOrderId === order.id}
                      onDeliver={() => handleDeliver(order)}
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
