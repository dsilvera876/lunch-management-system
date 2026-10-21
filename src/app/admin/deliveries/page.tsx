import { requireViewAllOrders, canFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildInitialDeliveriesFilters } from "@/lib/deliveries";
import { getJamaicaTodayDate } from "@/lib/datetime";
import { formatHumanDate } from "@/lib/format";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRows,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import { DeliveriesWorkspace } from "@/components/admin/deliveries-workspace";
import { pageMetadata } from "@/lib/page-titles";

export const metadata = pageMetadata("adminDeliveries");

type Props = {
  searchParams: Promise<{
    provider?: string;
    location?: string;
    status?: string;
  }>;
};

export default async function AdminDeliveriesPage({ searchParams }: Props) {
  const profile = await requireViewAllOrders();
  const canReconcile = canFulfillOrders(profile.role);
  const params = await searchParams;
  const supabase = await createClient();

  const deliveryDate = getJamaicaTodayDate();

  const initialFilters = buildInitialDeliveriesFilters({
    deliveryDate,
    providerId: params.provider,
    officeLocation: params.location,
    statusParam: params.status,
  });

  const [{ data: providers }, { data: locationRows }] = await Promise.all([
    supabase
      .from("lunch_providers")
      .select("id, name")
      .eq("active", true)
      .order("name", { ascending: true }),

    supabase
      .from("office_locations")
      .select("name")
      .order("name", { ascending: true }),
  ]);

  const { data, error } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("lunch_days.lunch_date", deliveryDate)
    .order("created_at", { ascending: true });

  if (error) {
    failOperationalOrdersQuery(
      "admin/deliveries",
      error,
      "Unable to load deliveries.",
    );
  }

  const orders = await parseOperationalOrderRows(
    supabase,
    (data ?? []) as unknown as OperationalOrderRow[],
    "admin-deliveries",
  );

  const locationNames = Array.from(
    new Set(
      (locationRows ?? [])
        .map((row) => row.name)
        .concat(orders.map((order) => order.officeLocationName)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <DeliveriesWorkspace
      initialOrders={orders}
      initialFilters={initialFilters}
      providers={providers ?? []}
      locationNames={locationNames}
      canReconcile={canReconcile}
      deliveryDateLabel={formatHumanDate(deliveryDate)}
    />
  );
}
