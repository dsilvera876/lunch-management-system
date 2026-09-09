import Link from "next/link";
import { requireViewAllOrders, canFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHumanDate } from "@/lib/format";
import { getDefaultOperationalDeliveryDate } from "@/lib/operational-delivery-date";
import { buildOperationalDeliveryReport } from "@/lib/operational-orders";
import {
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import { ProviderOperationalSection } from "@/components/admin/operational-orders";
import type { SnapshotMenuItem } from "@/components/admin/delivery-reconciliation-actions";
import {
  RECONCILIATION_FILTERS,
  countsForReconciliationFilter,
  matchesReconciliationFilter,
  type ReconciliationFilter,
} from "@/lib/delivery-reconciliation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, selectClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    deliveryDate?: string;
    provider?: string;
    reconciliation?: string;
    location?: string;
    error?: string;
    delivered?: string;
    "issue-reported"?: string;
    resolved?: string;
    waived?: string;
    "resolution-updated"?: string;
    adjusted?: string;
    "notes-updated"?: string;
  }>;
};

function buildOrdersReturnPath(params: {
  deliveryDate: string;
  provider?: string;
  reconciliation?: string;
  location?: string;
}): string {
  const query = new URLSearchParams();
  query.set("deliveryDate", params.deliveryDate);

  if (params.provider) {
    query.set("provider", params.provider);
  }

  if (params.reconciliation) {
    query.set("reconciliation", params.reconciliation);
  }

  if (params.location) {
    query.set("location", params.location);
  }

  return `/admin/orders?${query.toString()}`;
}

const RECONCILIATION_FILTER_LABELS: Record<ReconciliationFilter, string> = {
  all: "All",
  pending: "Pending",
  delivered: "Delivered",
  issues: "Issues",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

export default async function AdminOrdersPage({ searchParams }: Props) {
  const profile = await requireViewAllOrders();
  const canReconcile = canFulfillOrders(profile.role);
  const params = await searchParams;
  const supabase = await createClient();

  const deliveryDate =
    params.deliveryDate?.trim() || getDefaultOperationalDeliveryDate();

  const reconciliationFilter = RECONCILIATION_FILTERS.includes(
    params.reconciliation as ReconciliationFilter,
  )
    ? (params.reconciliation as ReconciliationFilter)
    : "all";

  const [{ data: providers }, { data: locationRows }, { data: deliveryDates }] =
    await Promise.all([
      supabase
        .from("lunch_providers")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true }),

      supabase
        .from("office_locations")
        .select("name")
        .order("name", { ascending: true }),

      supabase
        .from("lunch_days")
        .select("lunch_date")
        .order("lunch_date", { ascending: false })
        .limit(90),
    ]);

  let ordersQuery = supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("lunch_days.lunch_date", deliveryDate)
    .order("created_at", { ascending: true });

  if (params.provider) {
    ordersQuery = ordersQuery.eq("lunch_days.provider_id", params.provider);
  }

  if (params.location) {
    ordersQuery = ordersQuery.eq("office_location_name", params.location);
  }

  const { data, error } = await ordersQuery;

  if (error) {
    throw new Error("Unable to load orders.");
  }

  const parsedOrders = (data ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const orders = parsedOrders.filter((order) =>
    matchesReconciliationFilter(reconciliationFilter, order),
  );

  const report = buildOperationalDeliveryReport(orders, deliveryDate);
  const filterCounts = countsForReconciliationFilter(parsedOrders);

  const lunchDayIds = Array.from(new Set(parsedOrders.map((order) => order.lunchDayId)));
  const { data: menuItemRows } = lunchDayIds.length
    ? await supabase
        .from("menu_items")
        .select("id, lunch_day_id, name, item_type, unit_label, price, is_active")
        .in("lunch_day_id", lunchDayIds)
        .eq("is_active", true)
        .order("name", { ascending: true })
    : { data: [] as never[] };

  const snapshotMenuItemsByLunchDay = (menuItemRows ?? []).reduce<
    Record<string, SnapshotMenuItem[]>
  >((acc, item) => {
    const bucket = acc[item.lunch_day_id] ?? [];
    bucket.push({
      id: item.id,
      name: item.name,
      itemType: item.item_type,
      unitLabel: item.unit_label,
      price: Number(item.price),
    });
    acc[item.lunch_day_id] = bucket;
    return acc;
  }, {});

  const locationNames = Array.from(
    new Set(
      (locationRows ?? [])
        .map((row) => row.name)
        .concat(parsedOrders.map((order) => order.officeLocationName)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const availableDeliveryDates = Array.from(
    new Set((deliveryDates ?? []).map((row) => row.lunch_date)),
  );

  if (!availableDeliveryDates.includes(deliveryDate)) {
    availableDeliveryDates.unshift(deliveryDate);
  }

  const returnTo = buildOrdersReturnPath({
    deliveryDate,
    provider: params.provider,
    reconciliation: reconciliationFilter === "all" ? undefined : reconciliationFilter,
    location: params.location,
  });

  const successMessage =
    params.delivered
      ? "Order marked as delivered."
      : params["issue-reported"]
        ? "Delivery issue reported."
        : params.resolved
          ? "Replacement delivery confirmed."
          : params.waived
            ? "Order resolved with no charge."
            : params["resolution-updated"]
              ? "Resolution plan updated."
              : params.adjusted
                ? "Order adjustment saved."
                : params["notes-updated"]
                  ? "HR notes updated."
                  : null;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Detailed order lookup, issue history, adjustments, and audit context. For daily delivery check-off, use Deliveries."
      />

      <p className="mb-6 text-sm">
        <Link href="/admin/deliveries" className="font-medium text-primary hover:underline">
          Open Deliveries workspace
        </Link>{" "}
        for high-volume daily reconciliation.
      </p>

      {successMessage && (
        <Alert variant="success" className="mb-6">
          {successMessage}
        </Alert>
      )}

      {params.error && (
        <Alert variant="error" className="mb-6">
          Unable to update delivery reconciliation.
        </Alert>
      )}

      <Card className="mb-8">
        <SectionHeader title="Filters" />
        <form method="get" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <FormField label="Delivery date" htmlFor="deliveryDate">
            <select
              id="deliveryDate"
              name="deliveryDate"
              defaultValue={deliveryDate}
              className={selectClassName}
            >
              {availableDeliveryDates.map((date) => (
                <option key={date} value={date}>
                  {formatHumanDate(date)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Provider" htmlFor="provider">
            <select
              id="provider"
              name="provider"
              defaultValue={params.provider ?? ""}
              className={selectClassName}
            >
              <option value="">All providers</option>
              {(providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Office location" htmlFor="location">
            <select
              id="location"
              name="location"
              defaultValue={params.location ?? ""}
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

          <FormField label="Reconciliation" htmlFor="reconciliation">
            <select
              id="reconciliation"
              name="reconciliation"
              defaultValue={reconciliationFilter}
              className={selectClassName}
            >
              {RECONCILIATION_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {RECONCILIATION_FILTER_LABELS[filter]} ({filterCounts[filter]})
                </option>
              ))}
            </select>
          </FormField>

          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Apply
            </Button>
            <Link
              href={`/admin/orders?deliveryDate=${deliveryDate}`}
              className={linkButtonClass("ghost")}
            >
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <div className="mb-6 flex flex-wrap gap-4 text-sm text-muted">
        <span>
          Scheduled delivery {formatHumanDate(deliveryDate)} · {orders.length}{" "}
          {orders.length === 1 ? "order" : "orders"} shown
        </span>
        <span>{filterCounts.pending} pending</span>
        <span>{filterCounts.delivered} delivered</span>
        <span>{filterCounts.issues} issues</span>
        <span>{filterCounts.resolved} resolved</span>
        {filterCounts.cancelled > 0 && <span>{filterCounts.cancelled} cancelled</span>}
      </div>

      {report.providers.length === 0 ? (
        <EmptyState
          title="No orders match these filters"
          description={
            params.provider || params.location || reconciliationFilter !== "all"
              ? "Try clearing filters or choosing another delivery date."
              : "When staff place orders, they will appear here grouped by provider and office."
          }
        />
      ) : (
        <div className="space-y-10">
          {report.providers.map((provider) => (
            <ProviderOperationalSection
              key={provider.providerId}
              providerId={provider.providerId}
              providerName={provider.providerName}
              officeSummaries={provider.officeSummaries}
              preparationSections={provider.preparationSections}
              offices={provider.offices}
              canReconcile={canReconcile}
              returnTo={returnTo}
              deliveryDate={deliveryDate}
              snapshotMenuItemsByLunchDay={snapshotMenuItemsByLunchDay}
            />
          ))}
        </div>
      )}
    </>
  );
}
