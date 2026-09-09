import { requireViewAllOrders, canFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildInitialDeliveriesFilters } from "@/lib/deliveries";
import { getDefaultOperationalDeliveryDate } from "@/lib/operational-delivery-date";
import {
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import { DeliveriesWorkspace } from "@/components/admin/deliveries-workspace";

type Props = {
  searchParams: Promise<{
    deliveryDate?: string;
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

  const deliveryDate =
    params.deliveryDate?.trim() || getDefaultOperationalDeliveryDate();

  const initialFilters = buildInitialDeliveriesFilters({
    deliveryDate,
    providerId: params.provider,
    officeLocation: params.location,
    statusParam: params.status,
  });

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

  const { data, error } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("lunch_days.lunch_date", deliveryDate)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Unable to load deliveries.");
  }

  const orders = (data ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const locationNames = Array.from(
    new Set(
      (locationRows ?? [])
        .map((row) => row.name)
        .concat(orders.map((order) => order.officeLocationName)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const availableDeliveryDates = Array.from(
    new Set((deliveryDates ?? []).map((row) => row.lunch_date)),
  );

  if (!availableDeliveryDates.includes(deliveryDate)) {
    availableDeliveryDates.unshift(deliveryDate);
  }

  return (
    <DeliveriesWorkspace
      initialOrders={orders}
      initialFilters={initialFilters}
      providers={providers ?? []}
      locationNames={locationNames}
      availableDeliveryDates={availableDeliveryDates}
      canReconcile={canReconcile}
    />
  );
}
