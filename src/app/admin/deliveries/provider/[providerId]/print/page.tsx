import { notFound } from "next/navigation";
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
  params: Promise<{ providerId: string }>;
  searchParams: Promise<{ deliveryDate?: string }>;
};

export default async function ProviderDeliveryPrintPage({ params, searchParams }: Props) {
  await requireViewAllOrders();

  const { providerId } = await params;
  const { deliveryDate: deliveryDateParam } = await searchParams;
  const deliveryDate =
    deliveryDateParam?.trim() || getDefaultOperationalDeliveryDate();

  const supabase = await createClient();

  const [{ data: provider, error: providerError }, { data: orders, error }] =
    await Promise.all([
      supabase
        .from("lunch_providers")
        .select("id, name")
        .eq("id", providerId)
        .maybeSingle(),

      supabase
        .from("orders")
        .select(OPERATIONAL_ORDERS_SELECT)
        .eq("lunch_days.lunch_date", deliveryDate)
        .eq("lunch_days.provider_id", providerId)
        .order("created_at", { ascending: true }),
    ]);

  if (providerError || !provider) {
    notFound();
  }

  if (error) {
    failOperationalOrdersQuery(
      "admin/deliveries/provider/print",
      error,
      "Unable to load delivery sheet.",
    );
  }

  const parsedOrders = (orders ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const document = buildDeliveryPrintDocument(
    parsedOrders,
    deliveryDate,
    provider.name,
  );
  assertDeliveriesPayloadSafe(document);

  return (
    <DeliveryPrintSheet document={document} />
  );
}
