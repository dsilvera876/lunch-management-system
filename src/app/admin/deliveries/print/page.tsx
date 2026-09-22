import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultOperationalDeliveryDate } from "@/lib/operational-delivery-date";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import {
  assertDeliveriesPayloadSafe,
  buildDeliveryPrintDocument,
} from "@/lib/deliveries";
import { DeliveryPrintSheet } from "@/components/admin/delivery-print-sheet";

type Props = {
  searchParams: Promise<{ deliveryDate?: string }>;
};

export default async function AllProvidersDeliveryPrintPage({ searchParams }: Props) {
  await requireViewAllOrders();

  const { deliveryDate: deliveryDateParam } = await searchParams;
  const deliveryDate =
    deliveryDateParam?.trim() || getDefaultOperationalDeliveryDate();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("lunch_days.lunch_date", deliveryDate)
    .order("created_at", { ascending: true });

  if (error) {
    failOperationalOrdersQuery(
      "admin/deliveries/print",
      error,
      "Unable to load delivery sheet.",
    );
  }

  const orders = (data ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const document = buildDeliveryPrintDocument(orders, deliveryDate, null);
  assertDeliveriesPayloadSafe(document);

  return (
    <DeliveryPrintSheet document={document} />
  );
}
