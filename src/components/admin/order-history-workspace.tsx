"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmployeePicker } from "@/components/employee-picker";
import type { EmployeePickerOption } from "@/lib/employee-picker";
import { formatHumanDate } from "@/lib/format";
import {
  countsForReconciliationFilter,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import {
  deliveryStatusBadgeClassName,
  resolveDeliveryStatusBadgeVariant,
} from "@/lib/deliveries-presentation";
import { getOperationalDisplayState } from "@/lib/delivery-reconciliation";
import type { OperationalOrder } from "@/lib/operational-orders";
import {
  buildOrderHistoryUrl,
  formatOrderHistoryCompactOrderLines,
  formatOrderHistorySummaryLine,
  formatOrderHistoryTableQuantity,
  shouldShowEmployeeHistoryTable,
  shouldShowProviderGroupedResults,
  ORDER_HISTORY_ALL_DATES,
  ORDER_HISTORY_ALL_DATES_LABEL,
  type OrderHistoryFilters,
  resolveProviderPrintDeliveryDate,
  sortOrdersForEmployeeHistory,
} from "@/lib/order-history";
import type { ProviderOperationalGroup } from "@/lib/operational-orders";
import { patchDeliveryOrder, type DeliveryOrderPatch } from "@/lib/deliveries";
import { OrderHistoryDetailDrawer } from "@/components/admin/order-history-detail-drawer";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField, selectClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconUtensils } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";

const RECONCILIATION_FILTER_LABELS: Record<ReconciliationFilter, string> = {
  all: "All statuses",
  pending: "Pending",
  delivered: "Delivered",
  issues: "Issues",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

type Props = {
  initialOrders: OperationalOrder[];
  unfilteredOrders: OperationalOrder[];
  filters: OrderHistoryFilters;
  defaultDeliveryDate: string;
  providers: Array<{ id: string; name: string }>;
  locationNames: string[];
  deliveryDates: string[];
  employees: EmployeePickerOption[];
  canReconcile: boolean;
  providerGroups: ProviderOperationalGroup[];
  selectedEmployeeName: string | null;
};

function StatusBadge({ order }: { order: OperationalOrder }) {
  const variant = resolveDeliveryStatusBadgeVariant(order);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${deliveryStatusBadgeClassName(variant)}`}
    >
      {getOperationalDisplayState(order)}
    </span>
  );
}

function OrderTableAction({
  onClick,
  label = "View",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-primary hover:underline"
    >
      {label}
    </button>
  );
}

function CompactOrderCell({ order }: { order: OperationalOrder }) {
  const lines = formatOrderHistoryCompactOrderLines(order);
  const [primary, ...rest] = lines;

  return (
    <div className="min-w-[8rem] text-sm">
      <p className="font-medium text-foreground">{primary}</p>
      {rest.length > 0 ? (
        <p className="text-xs text-muted">{rest.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function ProviderOfficeTable({
  orders,
  includeDate,
  onView,
}: {
  orders: OperationalOrder[];
  includeDate: boolean;
  onView: (orderId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/15 text-left text-xs uppercase tracking-wide text-muted">
            {includeDate ? <th className="px-2 py-2 font-semibold">Date</th> : null}
            {!includeDate ? <th className="px-2 py-2 font-semibold">Employee</th> : null}
            {includeDate ? (
              <>
                <th className="px-2 py-2 font-semibold">Provider</th>
                <th className="px-2 py-2 font-semibold">Office</th>
              </>
            ) : null}
            <th className="px-2 py-2 font-semibold">Order</th>
            <th className="px-2 py-2 font-semibold">Qty</th>
            <th className="px-2 py-2 font-semibold">Status</th>
            <th className="px-2 py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border/80 align-top">
              {includeDate ? (
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatHumanDate(order.deliveryDate)}
                </td>
              ) : null}
              {!includeDate ? (
                <td className="px-2 py-2 font-medium">{order.employeeName}</td>
              ) : null}
              {includeDate ? (
                <>
                  <td className="px-2 py-2">{order.providerName}</td>
                  <td className="px-2 py-2">{order.officeLocationName}</td>
                </>
              ) : null}
              <td className="px-2 py-2">
                <CompactOrderCell order={order} />
              </td>
              <td className="px-2 py-2 tabular-nums">
                {formatOrderHistoryTableQuantity(order)}
              </td>
              <td className="px-2 py-2">
                <StatusBadge order={order} />
              </td>
              <td className="px-2 py-2">
                <OrderTableAction onClick={() => onView(order.id)} label="View details" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderHistoryWorkspace({
  initialOrders,
  unfilteredOrders,
  filters: initialFilters,
  defaultDeliveryDate,
  providers,
  locationNames,
  deliveryDates,
  employees,
  canReconcile,
  providerGroups,
  selectedEmployeeName,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orders, setOrders] = useState(initialOrders);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [drawerRecentOrders, setDrawerRecentOrders] = useState<OperationalOrder[]>([]);

  const employeeHistoryMode = shouldShowEmployeeHistoryTable(initialFilters);
  const showProviderCards = shouldShowProviderGroupedResults(initialFilters);
  const filterCounts = useMemo(
    () => countsForReconciliationFilter(unfilteredOrders),
    [unfilteredOrders],
  );

  const employeeHistoryOrders = useMemo(
    () => sortOrdersForEmployeeHistory(orders),
    [orders],
  );

  const summaryLine = formatOrderHistorySummaryLine({
    filters: initialFilters,
    orders,
    employeeName: selectedEmployeeName,
  });

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) {
      return null;
    }

    return (
      orders.find((order) => order.id === selectedOrderId) ??
      drawerRecentOrders.find((order) => order.id === selectedOrderId) ??
      null
    );
  }, [selectedOrderId, orders, drawerRecentOrders]);

  const handleEmployeeRecentOrdersChange = useCallback((recentOrders: OperationalOrder[]) => {
    setDrawerRecentOrders(recentOrders);
  }, []);

  const handleOrderPatched = useCallback((patch: DeliveryOrderPatch) => {
    setOrders((current) => patchDeliveryOrder(current, patch));
    setDrawerRecentOrders((current) => patchDeliveryOrder(current, patch));
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedOrderId(null);
    setDrawerRecentOrders([]);
  }, []);

  const applyFilters = () => {
    startTransition(() => {
      router.push(buildOrderHistoryUrl(draftFilters));
    });
  };

  const clearFilters = () => {
    const cleared: OrderHistoryFilters = {
      deliveryDate: defaultDeliveryDate,
      providerId: "",
      officeLocation: "",
      reconciliationStatus: "all",
      employeeId: "",
    };
    setDraftFilters(cleared);
    startTransition(() => {
      router.push(buildOrderHistoryUrl(cleared));
    });
  };

  return (
    <>
      <Card className="mb-4">
        <SectionHeader title="Filters" />
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <FormField label="Delivery date" htmlFor="order-history-delivery-date">
            <select
              id="order-history-delivery-date"
              value={draftFilters.deliveryDate}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  deliveryDate: event.target.value,
                }))
              }
              className={selectClassName}
            >
              <option value={ORDER_HISTORY_ALL_DATES}>{ORDER_HISTORY_ALL_DATES_LABEL}</option>
              {deliveryDates.map((date) => (
                <option key={date} value={date}>
                  {formatHumanDate(date)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Provider" htmlFor="order-history-provider">
            <select
              id="order-history-provider"
              value={draftFilters.providerId}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  providerId: event.target.value,
                }))
              }
              className={selectClassName}
            >
              <option value="">All providers</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Office location" htmlFor="order-history-location">
            <select
              id="order-history-location"
              value={draftFilters.officeLocation}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  officeLocation: event.target.value,
                }))
              }
              className={selectClassName}
            >
              <option value="">All locations</option>
              {locationNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Reconciliation status" htmlFor="order-history-status">
            <select
              id="order-history-status"
              value={draftFilters.reconciliationStatus}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  reconciliationStatus: event.target.value as ReconciliationFilter,
                }))
              }
              className={selectClassName}
            >
              {(Object.keys(RECONCILIATION_FILTER_LABELS) as ReconciliationFilter[]).map(
                (filter) => (
                  <option key={filter} value={filter}>
                    {RECONCILIATION_FILTER_LABELS[filter]}
                    {filter !== "all" ? ` (${filterCounts[filter]})` : ""}
                  </option>
                ),
              )}
            </select>
          </FormField>

          <FormField label="Employee" htmlFor="order-history-employee">
            <EmployeePicker
              employees={employees}
              value={draftFilters.employeeId}
              onValueChange={(employeeId) =>
                setDraftFilters((current) => ({ ...current, employeeId }))
              }
              id="order-history-employee"
            />
          </FormField>

          <div className="flex gap-2">
            <Button type="button" variant="primary" disabled={pending} onClick={applyFilters}>
              Apply
            </Button>
            <button
              type="button"
              className={linkButtonClass("ghost")}
              disabled={pending}
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        </div>
      </Card>

      <p className="mb-4 text-sm text-muted">{summaryLine}</p>

      {orders.length === 0 ? (
        <EmptyState
          title={
            initialFilters.employeeId
              ? "No order history found for this employee."
              : "No orders found for the selected filters."
          }
          description={
            initialFilters.employeeId || initialFilters.deliveryDate === ORDER_HISTORY_ALL_DATES
              ? "Try another employee, date, or status filter."
              : "Try clearing filters or choosing another delivery date."
          }
        />
      ) : (
        <div className="space-y-6">
          {employeeHistoryMode ? (
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {selectedEmployeeName ?? "Employee"}&apos;s Orders
                  </h2>
                  <p className="text-sm text-muted">
                    Orders across all dates and locations.
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {employeeHistoryOrders.length}{" "}
                  {employeeHistoryOrders.length === 1 ? "order" : "orders"}
                </span>
              </div>
              <ProviderOfficeTable
                orders={employeeHistoryOrders}
                includeDate
                onView={setSelectedOrderId}
              />
            </section>
          ) : null}

          {showProviderCards
            ? providerGroups.map((provider) => {
            const providerOrders = provider.offices.flatMap((office) => office.orders);
            const printDate = resolveProviderPrintDeliveryDate(
              providerOrders,
              initialFilters,
              defaultDeliveryDate,
            );

            return (
              <section
                key={provider.providerId}
                className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
              >
                <div className="border-t-4 border-t-primary/50 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <TealIconWell size="md" className="shrink-0 rounded-xl">
                        <IconUtensils aria-hidden />
                      </TealIconWell>
                      <h2 className="text-base font-semibold text-foreground">
                        {provider.providerName}
                      </h2>
                    </div>
                    <Link
                      href={`/admin/deliveries/provider/${provider.providerId}/print?deliveryDate=${printDate}`}
                      className={linkButtonClass("secondary")}
                    >
                      Print Delivery Sheet
                    </Link>
                  </div>
                </div>

                <div className="space-y-4 px-4 pb-4">
                  {provider.offices.map((office) => (
                    <div key={office.name}>
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{office.name}</h3>
                        <span className="text-xs text-muted">
                          {office.orders.length}{" "}
                          {office.orders.length === 1 ? "order" : "orders"}
                        </span>
                      </div>
                      <ProviderOfficeTable
                        orders={office.orders}
                        includeDate={false}
                        onView={setSelectedOrderId}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })
            : null}
        </div>
      )}

      <OrderHistoryDetailDrawer
        order={selectedOrder}
        open={selectedOrderId !== null}
        canReconcile={canReconcile}
        onClose={closeDrawer}
        onOrderPatched={handleOrderPatched}
        onEmployeeRecentOrdersChange={handleEmployeeRecentOrdersChange}
        onSelectOrderId={setSelectedOrderId}
      />
    </>
  );
}
