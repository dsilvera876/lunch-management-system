"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  RECONCILIATION_FILTERS,
  canReportIssue,
  canMarkDelivered,
  canUnmarkDelivered,
  countsForReconciliationFilter,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import {
  applyDeliveriesToolbarFilters,
  computeDeliveryProgress,
  filterDeliveriesOrders,
  formatDeliveryOrderDescription,
  groupOrdersByOfficeLocation,
  patchDeliveryOrder,
  replaceDeliveriesUrlInHistory,
  type DeliveriesFilterState,
} from "@/lib/deliveries";
import {
  clearDeliveryConflictEntries,
  finishDeliveryToggle,
  prepareDeliveryToggle,
  snapshotDeliveryConflictOrderIds,
  type DeliveryToggleMutationResult,
} from "@/lib/delivery-reconciliation-toggle";
import type { DeliveryOrderPatch } from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  markOrderDeliveredMutation,
  revertOrderDeliveryToPendingMutation,
  type DeliveryMutationResult,
} from "@/app/admin/deliveries/mutations";
import { loadDeliveriesForDateAction } from "@/app/admin/deliveries/load-data";
import { DeliveryIssuePanel } from "@/components/admin/delivery-issue-panel";
import { DeliveriesPageHeader } from "@/components/admin/deliveries-page-header";
import {
  DELIVERY_TOGGLE_ERROR_MESSAGE,
  deliveriesOfficeCardClassName,
  deliveryStatusBadgeClassName,
  formatDeliveryStatusBadgeLabel,
  resolveDeliveryStatusBadgeVariant,
} from "@/lib/deliveries-presentation";
import { Button, linkButtonClass } from "@/components/ui/button";
import { selectClassName } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { useSupportMode } from "@/components/app-shell/support-mode-context";
import { SupportModeMutationHint } from "@/components/app-shell/support-mode-ui";
import { DeliveryUndoConfirmDialog } from "@/components/admin/delivery-undo-confirm-dialog";

const STATUS_LABELS: Record<ReconciliationFilter, string> = {
  all: "All",
  pending: "Pending",
  delivered: "Delivered",
  issues: "Issues",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

function subscribeToHydration() {
  return () => undefined;
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

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

function DeliveryAction({
  order,
  canReconcile,
  interactive,
  refreshing,
  processing,
  feedbackId,
  hasError,
  onMarkDelivered,
  onRequestUndo,
}: {
  order: OperationalOrder;
  canReconcile: boolean;
  interactive: boolean;
  refreshing: boolean;
  processing: boolean;
  feedbackId: string;
  hasError: boolean;
  onMarkDelivered: (trigger: HTMLButtonElement) => void;
  onRequestUndo: (trigger: HTMLButtonElement) => void;
}) {
  if (!canReconcile) {
    return null;
  }

  const description = formatDeliveryOrderDescription(order).primaryLine;
  const commonProps = {
    type: "button" as const,
    className: "min-h-8 px-3 py-1 text-xs",
    "data-delivery-action": true,
    "data-delivery-order-id": order.id,
    "aria-describedby": hasError ? feedbackId : undefined,
    "aria-busy": processing,
    disabled: processing || refreshing || !interactive,
  };

  if (canMarkDelivered(order)) {
    return <Button {...commonProps} variant="primary" aria-label={processing ? `Marking ${order.employeeName}'s ${description} delivered` : `Mark ${order.employeeName}'s ${description} delivered`} onClick={(event) => onMarkDelivered(event.currentTarget)}>{processing ? "Marking delivered…" : "Mark delivered"}</Button>;
  }

  if (canUnmarkDelivered(order)) {
    return <Button {...commonProps} variant="secondary" aria-label={processing ? `Undoing delivery for ${order.employeeName}'s ${description}` : `Undo delivery for ${order.employeeName}'s ${description}`} onClick={(event) => onRequestUndo(event.currentTarget)}>{processing ? "Undoing delivery…" : "Undo delivery"}</Button>;
  }

  return <span className="text-xs text-muted">No delivery action</span>;
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
  interactive,
  refreshing,
  showProviderColumn,
  rowError,
  rowSuccess,
  processing,
  onMarkDelivered,
  onRequestUndo,
  onRetry,
  onIssue,
}: {
  order: OperationalOrder;
  canReconcile: boolean;
  interactive: boolean;
  refreshing: boolean;
  showProviderColumn: boolean;
  rowError: string | null;
  rowSuccess: string | null;
  processing: boolean;
  onMarkDelivered: (trigger: HTMLButtonElement) => void;
  onRequestUndo: (trigger: HTMLButtonElement) => void;
  onRetry: () => void;
  onIssue: () => void;
}) {
  const issueOpen = order.deliveryState === "issue_open";
  const issueActionLabel = issueOpen ? "View / Edit issue" : "Issue";
  const desktopFeedbackId = `delivery-feedback-desktop-${order.id}`;
  const mobileFeedbackId = `delivery-feedback-mobile-${order.id}`;

  return (
    <>
      <tr className="hidden border-b border-border last:border-b-0 md:table-row">
        <td className="px-2 py-1.5 align-middle">
          <DeliveryAction
            order={order}
            canReconcile={canReconcile}
            interactive={interactive}
            refreshing={refreshing}
            processing={processing}
            feedbackId={desktopFeedbackId}
            hasError={rowError !== null}
            onMarkDelivered={onMarkDelivered}
            onRequestUndo={onRequestUndo}
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
          <div className="space-y-1">
            <DeliveryStatusBadge order={order} />
            {processing ? (
              <p className="text-xs text-muted">Delivery update in progress…</p>
            ) : null}
            {rowSuccess ? (
              <p className="text-xs font-medium text-emerald-800">{rowSuccess}</p>
            ) : null}
          </div>
        </td>
        <td className="px-2 py-1.5 align-middle text-right">
          {(canReportIssue(order) || issueOpen) && canReconcile ? (
            <Button
              variant="ghost"
              onClick={onIssue}
              className="min-h-8 px-2 py-1 text-xs text-primary"
            >
              {issueActionLabel}
            </Button>
          ) : null}
        </td>
      </tr>
      {rowError ? (
        <tr className="hidden md:table-row">
          <td
            colSpan={showProviderColumn ? 7 : 6}
            className="border-b border-border px-2 pb-2 text-xs text-red-700"
          >
            <div>
              <p id={desktopFeedbackId} role="alert">
                {rowError}
              </p>
              <Button type="button" variant="ghost" className="mt-1 min-h-8 px-2 py-1 text-xs text-red-800" onClick={onRetry}>
                Retry
              </Button>
            </div>
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
                <DeliveryAction
                  order={order}
                  canReconcile={canReconcile}
                  interactive={interactive}
                  refreshing={refreshing}
                  processing={processing}
                  feedbackId={mobileFeedbackId}
                  hasError={rowError !== null}
                  onMarkDelivered={onMarkDelivered}
                  onRequestUndo={onRequestUndo}
                />
              </div>
              <p className="text-xs text-muted">{order.providerName}</p>
              <DesktopOrderCell order={order} />
              <DeliveryStatusBadge order={order} />
              {processing ? (
                <p className="text-xs text-muted">Delivery update in progress…</p>
              ) : null}
              {rowSuccess ? (
                <p className="text-xs font-medium text-emerald-800">{rowSuccess}</p>
              ) : null}
              {rowError ? (
                <div>
                  <p id={mobileFeedbackId} role="alert" className="text-xs text-red-700">
                    {rowError}
                  </p>
                  <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs text-red-800" onClick={onRetry}>
                    Retry
                  </Button>
                </div>
              ) : null}
            </div>
            {(canReportIssue(order) || issueOpen) && canReconcile ? (
              <Button
                variant="ghost"
                onClick={onIssue}
                className="min-h-8 shrink-0 px-2 py-1 text-xs text-primary"
              >
                {issueActionLabel}
              </Button>
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
  const { readOnly } = useSupportMode();
  const reconcileEnabled = canReconcile && !readOnly;
  const [orders, setOrders] = useState(initialOrders);
  const [filters, setFilters] = useState<DeliveriesFilterState>(initialFilters);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSuccesses, setRowSuccesses] = useState<Record<string, string>>({});
  const [processingOrderIds, setProcessingOrderIds] = useState<Record<string, true>>({});
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [recentUpdates, setRecentUpdates] = useState<
    Array<{ orderId: string; message: string }>
  >([]);
  const [undoOrderId, setUndoOrderId] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [staleOrderIds, setStaleOrderIds] = useState<Record<string, true>>({});
  const toggleVersionRef = useRef(new Map<string, number>());
  const ordersRef = useRef(initialOrders);
  const processingOrderIdsRef = useRef(new Set<string>());
  const undoTriggerRef = useRef<HTMLElement | null>(null);
  const pendingFocusRef = useRef<{ orderId: string; index: number } | null>(null);
  const conflictOrderIdsRef = useRef(new Set<string>());
  const refreshRequestedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

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
  const undoOrder = orders.find((order) => order.id === undoOrderId) ?? null;

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target || processingOrderIds[target.orderId]) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const actions = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-delivery-action]"))
        .filter((button) => button.offsetParent !== null && !button.disabled);
      const matchingAction = actions.find((button) => button.dataset.deliveryOrderId === target.orderId);
      const fallback = actions[Math.min(target.index, Math.max(actions.length - 1, 0))]
        ?? document.querySelector<HTMLButtonElement>("[data-delivery-filter]");
      (matchingAction ?? fallback)?.focus({ preventScroll: true });
      pendingFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [orders, filters, processingOrderIds]);

  const applyMutation = (result: DeliveryMutationResult) => {
    if (!result.success) {
      return false;
    }

    setOrders((current) => {
      const next = patchDeliveryOrder(current, result.patch);
      ordersRef.current = next;
      return next;
    });
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

  const clearRowSuccess = (orderId: string) => {
    setRowSuccesses((current) => {
      if (!current[orderId]) {
        return current;
      }

      const next = { ...current };
      delete next[orderId];
      return next;
    });
  };

  const refreshAuthoritativeOrders = useCallback(() => {
    if (
      !refreshRequestedRef.current ||
      refreshInFlightRef.current ||
      processingOrderIdsRef.current.size > 0
    ) {
      return;
    }

    refreshRequestedRef.current = false;
    refreshInFlightRef.current = true;
    setRefreshingOrders(true);

    void loadDeliveriesForDateAction(filters.deliveryDate)
      .then((result) => {
        if (!result.success) {
          const message = "Could not refresh delivery status. Try again.";
          setRefreshMessage(message);
          setLiveAnnouncement(message);
          return;
        }

        const conflictOrderIds = snapshotDeliveryConflictOrderIds(
          conflictOrderIdsRef.current,
        );
        conflictOrderIdsRef.current.clear();
        ordersRef.current = result.orders;
        setOrders(result.orders);
        setIssueOrderId((orderId) =>
          orderId && result.orders.some((order) => order.id === orderId) ? orderId : null,
        );
        setUndoOrderId(null);
        setRowErrors((errors) => clearDeliveryConflictEntries(errors, conflictOrderIds));
        setRowSuccesses((successes) => clearDeliveryConflictEntries(successes, conflictOrderIds));
        setStaleOrderIds((stale) => clearDeliveryConflictEntries(stale, conflictOrderIds));
        const message = "Delivery status changed by another authorized HR user. Latest delivery data is now shown.";
        setRefreshMessage(message);
        setLiveAnnouncement(message);
      })
      .catch(() => {
        const message = "Could not refresh delivery status. Try again.";
        setRefreshMessage(message);
        setLiveAnnouncement(message);
      })
      .finally(() => {
        refreshInFlightRef.current = false;
        setRefreshingOrders(false);
      });
  }, [filters.deliveryDate]);

  const applyFinishedToggle = (
    orderId: string,
    order: OperationalOrder,
    markingDelivered: boolean,
    expectedVersion: number,
    rollbackSnapshot: DeliveryOrderPatch,
    result: DeliveryToggleMutationResult,
  ) => {
    const currentVersion = toggleVersionRef.current.get(orderId) ?? 0;
    const finished = finishDeliveryToggle(
      ordersRef.current,
      expectedVersion,
      currentVersion,
      rollbackSnapshot,
      result,
      DELIVERY_TOGGLE_ERROR_MESSAGE,
    );
    ordersRef.current = finished.orders;
    setOrders(finished.orders);

    const actionLabel = markingDelivered ? "mark delivered" : "undo delivery";
    const orderLabel = formatDeliveryOrderDescription(order).primaryLine;
    if (finished.rowError) {
      const conflict = !result.success && result.conflict === true;
      const message = !conflict
        ? `Could not ${actionLabel} for ${order.employeeName}'s ${orderLabel} order. Try again.`
        : `${order.employeeName}'s ${orderLabel} order changed before this update. Refreshing the latest delivery status.`;
      setRowErrors((errors) => ({
        ...errors,
        [orderId]: message,
      }));
      setLiveAnnouncement(message);
      clearRowSuccess(orderId);
      if (conflict) {
        conflictOrderIdsRef.current.add(orderId);
        setStaleOrderIds((stale) => ({ ...stale, [orderId]: true }));
        refreshRequestedRef.current = true;
      }
    } else if (finished.successMessage) {
      const message = `${order.employeeName}'s ${orderLabel} order was ${markingDelivered ? "marked delivered" : "returned to Pending"}.`;
      setRowErrors((errors) => {
        if (!errors[orderId]) {
          return errors;
        }

        const next = { ...errors };
        delete next[orderId];
        return next;
      });
      setRowSuccesses((successes) => ({
        ...successes,
        [orderId]: message,
      }));
      setRecentUpdates((updates) => [
        { orderId, message },
        ...updates.filter((update) => update.orderId !== orderId),
      ].slice(0, 4));
      setLiveAnnouncement(message);
    }
  };

  const handleDeliveryToggle = (orderId: string, markingDelivered: boolean, trigger?: HTMLButtonElement) => {
    if (!reconcileEnabled || refreshInFlightRef.current) {
      return;
    }

    const prepared = prepareDeliveryToggle(
      ordersRef.current,
      orderId,
      processingOrderIdsRef.current,
    );

    if (prepared.kind !== "ready") {
      return;
    }

    const order = ordersRef.current.find((entry) => entry.id === orderId);
    if (!order) {
      return;
    }
    const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-delivery-action]"))
      .filter((button) => button.offsetParent !== null);
    pendingFocusRef.current = {
      orderId,
      index: trigger ? Math.max(actionButtons.indexOf(trigger), 0) : 0,
    };

    processingOrderIdsRef.current.add(orderId);
    setProcessingOrderIds((current) => ({ ...current, [orderId]: true }));

    const actualDeliveryDate = getJamaicaTodayDate();
    const version = (toggleVersionRef.current.get(orderId) ?? 0) + 1;
    toggleVersionRef.current.set(orderId, version);
    clearRowError(orderId);
    clearRowSuccess(orderId);

    void (async () => {
      try {
        const result = markingDelivered
          ? await markOrderDeliveredMutation({ orderId, actualDeliveryDate })
          : await revertOrderDeliveryToPendingMutation({ orderId });

        applyFinishedToggle(orderId, order, markingDelivered, version, prepared.rollbackSnapshot, result);
      } catch {
        applyFinishedToggle(orderId, order, markingDelivered, version, prepared.rollbackSnapshot, {
          success: false,
          error: DELIVERY_TOGGLE_ERROR_MESSAGE,
        });
      } finally {
        processingOrderIdsRef.current.delete(orderId);
        setProcessingOrderIds((current) => {
          if (!current[orderId]) {
            return current;
          }

          const next = { ...current };
          delete next[orderId];
          return next;
        });
        refreshAuthoritativeOrders();
      }
    })();
  };

  return (
    <div className="space-y-3">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </p>
      <DeliveriesPageHeader
        deliveryDateLabel={deliveryDateLabel}
        reconciled={overallProgress.reconciled}
        total={overallProgress.total}
      />

      {recentUpdates.length > 0 ? (
        <section aria-label="Recent delivery updates" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-medium">Recent delivery updates</p>
          <ul className="mt-1 list-disc pl-5">
            {recentUpdates.map((update) => (
              <li key={update.orderId}>{update.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {readOnly ? <SupportModeMutationHint /> : null}

      {refreshMessage ? (
        <p className="text-sm text-muted">
          {refreshMessage}
        </p>
      ) : null}

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
              data-delivery-filter
              aria-pressed={selected}
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

            <div className="md:overflow-x-auto">
              <table className="w-full border-collapse md:min-w-[760px]">
                <thead className="hidden bg-muted/15 text-left text-[11px] uppercase tracking-wide text-muted md:table-header-group">
                  <tr>
                    <th className="w-32 px-2 py-1.5 font-medium">Delivery</th>
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
                      canReconcile={reconcileEnabled}
                      interactive={interactive}
                      refreshing={refreshingOrders}
                      showProviderColumn={showProviderColumn}
                      rowError={rowErrors[order.id] ?? null}
                      rowSuccess={rowSuccesses[order.id] ?? null}
                      processing={processingOrderIds[order.id] === true}
                       onMarkDelivered={(trigger) => handleDeliveryToggle(order.id, true, trigger)}
                       onRequestUndo={(trigger) => {
                         undoTriggerRef.current = trigger;
                         setUndoOrderId(order.id);
                       }}
                       onRetry={() => {
                         if (staleOrderIds[order.id]) {
                           refreshRequestedRef.current = true;
                           refreshAuthoritativeOrders();
                           return;
                         }
                         if (order.deliveryState === "delivered") {
                           setUndoOrderId(order.id);
                           return;
                         }
                         handleDeliveryToggle(order.id, true);
                       }}
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
      <DeliveryUndoConfirmDialog
        order={undoOrder}
        open={undoOrder !== null}
        processing={undoOrder ? processingOrderIds[undoOrder.id] === true : false}
        triggerRef={undoTriggerRef}
        onOpenChange={(open) => {
          if (!open) {
            setUndoOrderId(null);
          }
        }}
        onConfirm={() => {
          if (!undoOrder) {
            return;
          }
          setUndoOrderId(null);
          handleDeliveryToggle(undoOrder.id, false, undoTriggerRef.current as HTMLButtonElement | undefined);
        }}
      />
    </div>
  );
}
