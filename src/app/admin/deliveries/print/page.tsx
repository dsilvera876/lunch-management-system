import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchDefaultOperationalDeliveryDate } from "@/lib/business-calendar-server";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRows,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import {
  assertDeliveriesPayloadSafe,
  buildDeliveryPrintDocument,
} from "@/lib/deliveries";
import { DeliveryPrintSheet } from "@/components/admin/delivery-print-sheet";
import { pageMetadata } from "@/lib/page-titles";

export const metadata = pageMetadata("adminDeliveriesPrint");

type Props = {
  searchParams: Promise<{ deliveryDate?: string }>;
};

export default async function AllProvidersDeliveryPrintPage({ searchParams }: Props) {
  await requireViewAllOrders();

  const { deliveryDate: deliveryDateParam } = await searchParams;
  const deliveryDate =
    deliveryDateParam?.trim() || (await fetchDefaultOperationalDeliveryDate());

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

  const orders = await parseOperationalOrderRows(
    supabase,
    (data ?? []) as unknown as OperationalOrderRow[],
    "admin-deliveries-print",
  );

  const document = buildDeliveryPrintDocument(orders, deliveryDate, null);
  assertDeliveriesPayloadSafe(document);

  return (
    <DeliveryPrintSheet document={document} />
  );
}
