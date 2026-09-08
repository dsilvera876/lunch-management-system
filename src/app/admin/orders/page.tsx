import Link from "next/link";
import { requireViewAllOrders, canFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fulfillOrder } from "./actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { getRelated, formatDeadline, formatCurrency } from "@/lib/format";
import { formatOrderLineLabel } from "@/lib/menu-items";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, selectClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    lunchDay?: string;
    status?: string;
    location?: string;
    error?: string;
    fulfilled?: string;
  }>;
};

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  special_instructions: string | null;
  office_location_name: string | null;
  office_location_address: string | null;
  profiles: ReturnType<typeof getRelated<{ full_name: string | null }>>;
  lunch_days: ReturnType<typeof getRelated<{ lunch_date: string }>>;
  order_items: Array<{
    id: string;
    quantity: number;
    unit_price: number | string;
    menu_items: ReturnType<
      typeof getRelated<{ name: string; unit_label: string }>
    >;
  }>;
};

export default async function AdminOrdersPage({ searchParams }: Props) {
  const profile = await requireViewAllOrders();
  const canFulfill = canFulfillOrders(profile.role);

  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: lunchDays, error: lunchDaysError }, { data: locationRows }] =
    await Promise.all([
    supabase
    .from("lunch_days")
    .select("id, lunch_date")
    .order("lunch_date", { ascending: false }),

    supabase
      .from("office_locations")
      .select("name")
      .order("name", { ascending: true }),
  ]);

  if (lunchDaysError) {
    throw new Error("Unable to load lunch days.");
  }

  let ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      status,
      created_at,
      special_instructions,
      office_location_name,
      office_location_address,
      profiles (
        full_name
      ),
      lunch_days (
        lunch_date
      ),
      order_items (
        id,
        quantity,
        unit_price,
        menu_items (
          name,
          unit_label
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (params.lunchDay) {
    ordersQuery = ordersQuery.eq("lunch_day_id", params.lunchDay);
  }

  if (
    params.status &&
    ["submitted", "cancelled", "fulfilled"].includes(params.status)
  ) {
    ordersQuery = ordersQuery.eq("status", params.status);
  }

  if (params.location) {
    ordersQuery = ordersQuery.eq("office_location_name", params.location);
  }

  const { data, error } = await ordersQuery;

  if (error) {
    throw new Error("Unable to load orders.");
  }

  const orders = (data ?? []) as unknown as OrderRow[];

  const itemTotals = new Map<string, { name: string; quantity: number }>();
  let activeOrderValue = 0;

  for (const order of orders) {
    if (order.status === "cancelled") continue;

    for (const item of order.order_items) {
      const menuItem = getRelated(item.menu_items);
      const name = menuItem?.name ?? "Menu item";
      const existing = itemTotals.get(name);

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        itemTotals.set(name, { name, quantity: item.quantity });
      }

      activeOrderValue += Number(item.unit_price) * item.quantity;
    }
  }

  const summaryItems = Array.from(itemTotals.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const locationNames = Array.from(
    new Set(
      (locationRows ?? [])
        .map((row) => row.name)
        .concat(orders.map((order) => order.office_location_name).filter(Boolean) as string[]),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const groupedOrders = new Map<string, OrderRow[]>();

  for (const order of orders) {
    const locationLabel = order.office_location_name ?? "No delivery location";
    const existing = groupedOrders.get(locationLabel) ?? [];
    existing.push(order);
    groupedOrders.set(locationLabel, existing);
  }

  const groupedOrderEntries = Array.from(groupedOrders.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <>
      <PageHeader
        title="Orders"
        description="Each row is one individual order. Employees may have multiple orders for the same delivery date."
      />

      {params.fulfilled && (
        <Alert variant="success" className="mb-6">
          Order marked as fulfilled.
        </Alert>
      )}

      {params.error && (
        <Alert variant="error" className="mb-6">
          Unable to update order.
        </Alert>
      )}

      <Card className="mb-8">
        <SectionHeader title="Filters" />
        <form method="get" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <FormField label="Delivery date" htmlFor="lunchDay">
            <select
              id="lunchDay"
              name="lunchDay"
              defaultValue={params.lunchDay ?? ""}
              className={selectClassName}
            >
              <option value="">All delivery dates</option>
              {lunchDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.lunch_date}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ""}
              className={selectClassName}
            >
              <option value="">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </FormField>

          <FormField label="Delivery location" htmlFor="location">
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

          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Apply
            </Button>
            <Link href="/admin/orders" className={linkButtonClass("ghost")}>
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <SectionHeader
            title="Menu item totals"
            description="Cancelled orders excluded."
          />
          {summaryItems.length === 0 ? (
            <p className="text-sm text-muted">No active ordered items.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {summaryItems.map((item) => (
                <li key={item.name} className="flex justify-between gap-4">
                  <span>{item.name}</span>
                  <span className="font-medium">{item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm font-semibold">
            Active order value: {formatCurrency(activeOrderValue)}
          </p>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <SectionHeader title={`Orders (${orders.length})`} />

          {orders.length === 0 ? (
            <EmptyState title="No orders match these filters" />
          ) : (
            groupedOrderEntries.map(([locationName, locationOrders]) => (
              <div key={locationName} className="space-y-4">
                <SectionHeader
                  title={locationName}
                  description={`${locationOrders.length} order${locationOrders.length === 1 ? "" : "s"}`}
                />
                {locationOrders.map((order) => {
              const profile = getRelated(order.profiles);
              const lunchDay = getRelated(order.lunch_days);
              const orderTotal = order.order_items.reduce(
                (total, item) => total + Number(item.unit_price) * item.quantity,
                0,
              );

              return (
                <Card key={order.id} padding="sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {profile?.full_name ?? "Unnamed user"}
                        </h3>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="text-sm text-muted">
                        Delivery {lunchDay?.lunch_date ?? "Unknown"} · Order{" "}
                        {order.id.slice(0, 8)}
                      </p>
                      {order.office_location_address && (
                        <p className="text-sm text-muted">
                          {order.office_location_address}
                        </p>
                      )}
                      <p className="text-sm text-muted">
                        Submitted {formatDeadline(order.created_at)}
                      </p>
                      <p className="text-sm font-medium">
                        Total: {formatCurrency(orderTotal)}
                      </p>
                    </div>

                    {order.status === "submitted" && canFulfill && (
                      <form action={fulfillOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <FormSubmitButton
                          pendingText="Updating..."
                          confirmMessage="Mark this order as fulfilled?"
                          variant="primary"
                        >
                          Mark fulfilled
                        </FormSubmitButton>
                      </form>
                    )}
                  </div>

                  <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                    {order.order_items.map((item) => {
                      const menuItem = getRelated(item.menu_items);
                      const subtotal = Number(item.unit_price) * item.quantity;

                      return (
                        <li
                          key={item.id}
                          className="flex flex-col gap-1 sm:flex-row sm:justify-between"
                        >
                          <span>
                            {formatOrderLineLabel(
                              menuItem?.name ?? "Menu item",
                              menuItem?.unit_label ?? "Each",
                              item.quantity,
                            )}
                          </span>
                          <span className="text-muted">
                            {formatCurrency(item.unit_price)} each ·{" "}
                            {formatCurrency(subtotal)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {order.special_instructions && (
                    <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">
                      <p className="font-medium">Special instructions</p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {order.special_instructions}
                      </p>
                    </div>
                  )}
                </Card>
              );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
