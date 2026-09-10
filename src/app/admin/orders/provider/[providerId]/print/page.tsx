import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHumanDate } from "@/lib/format";
import {
  buildOperationalDeliveryReport,
  toProviderPrintOrder,
  assertProviderPrintPayloadSafe,
} from "@/lib/operational-orders";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import { OperationalOrderCard } from "@/components/admin/operational-orders";
import { PrintDeliverySheetButton } from "@/components/admin/print-delivery-sheet-button";
import { getDefaultOperationalDeliveryDate } from "@/lib/operational-delivery-date";

type Props = {
  params: Promise<{ providerId: string }>;
  searchParams: Promise<{ deliveryDate?: string }>;
};

export default async function ProviderDeliveryPrintPage({
  params,
  searchParams,
}: Props) {
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
      "admin/orders/provider/print",
      error,
      "Unable to load delivery sheet.",
    );
  }

  const parsedOrders = (orders ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const report = buildOperationalDeliveryReport(parsedOrders, deliveryDate);
  const providerGroup = report.providers[0];

  const printPayload = {
    provider: provider.name,
    deliveryDate,
    offices: (providerGroup?.offices ?? []).map((office) => ({
      name: office.name,
      orders: office.orders.map((order) => toProviderPrintOrder(order)),
    })),
    preparationSections: providerGroup?.preparationSections ?? [],
  };

  assertProviderPrintPayloadSafe(printPayload);

  const generatedAt = new Intl.DateTimeFormat("en-JM", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-foreground print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4 print:hidden">
        <Link
          href={`/admin/orders?deliveryDate=${deliveryDate}&provider=${providerId}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Back to Orders
        </Link>
        <PrintDeliverySheetButton />
      </div>

      <header className="mb-8 border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{provider.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Delivery date: {formatHumanDate(deliveryDate)}
        </p>
        <p className="text-sm text-muted">Generated {generatedAt}</p>
      </header>

      {!providerGroup || providerGroup.offices.length === 0 ? (
        <p className="text-sm text-muted">No qualifying orders for this delivery date.</p>
      ) : (
        <div className="space-y-8">
          {providerGroup.preparationSections.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Preparation Summary</h2>
              <div className="mt-3 space-y-4 text-sm">
                {providerGroup.preparationSections.map((section) => (
                  <div key={section.label}>
                    <p className="font-semibold">{section.label}</p>
                    <ul className="mt-1 space-y-1">
                      {section.lines.map((line) => (
                        <li key={`${section.label}-${line.name}`}>
                          {line.name}
                          {line.unitLabel && line.unitLabel !== "Each"
                            ? ` (${line.unitLabel})`
                            : ""}{" "}
                          ×{line.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {providerGroup.offices.map((office) => (
            <section key={office.name} className="space-y-4 print:break-inside-avoid">
              <h2 className="text-lg font-semibold">{office.name}</h2>
              <div className="space-y-4">
                {office.orders.map((order) => (
                  <OperationalOrderCard
                    key={order.id}
                    order={order}
                    canReconcile={false}
                    returnTo=""
                    subdued
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
