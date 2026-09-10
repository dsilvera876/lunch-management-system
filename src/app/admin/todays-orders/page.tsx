import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getJamaicaTodayDate } from "@/lib/datetime";
import { formatHumanDate } from "@/lib/format";
import { buildOperationalDeliveryReport } from "@/lib/operational-orders";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import { ProviderOperationalSection } from "@/components/admin/operational-orders";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";

export default async function TodaysOrdersPage() {
  await requireViewAllOrders();
  const supabase = await createClient();
  const orderDate = getJamaicaTodayDate();

  const { data, error } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("lunch_days.order_date", orderDate)
    .order("created_at", { ascending: true });

  if (error) {
    failOperationalOrdersQuery(
      "admin/todays-orders",
      error,
      "Unable to load today's orders.",
    );
  }

  const orders = (data ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const report = buildOperationalDeliveryReport(orders, orderDate);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Today's Orders — ${formatHumanDate(orderDate)}`}
        description="Orders placed during today's normal ordering cycle (order date = today). Late orders attributed to prior order dates appear on Late Orders and Order History instead."
      />

      {report.providers.length === 0 ? (
        <EmptyState
          title="No orders for today's ordering cycle"
          description="Staff orders with today's order date will appear here."
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-3 text-sm text-muted">
            {report.totalOrders} order{report.totalOrders === 1 ? "" : "s"} across{" "}
            {report.providers.length} provider{report.providers.length === 1 ? "" : "s"}
          </Card>

          {report.providers.map((provider) => (
            <ProviderOperationalSection
              key={provider.providerId}
              providerId={provider.providerId}
              providerName={provider.providerName}
              officeSummaries={provider.officeSummaries}
              preparationSections={provider.preparationSections}
              offices={provider.offices}
              canReconcile={false}
              returnTo="/admin/todays-orders"
              deliveryDate={orderDate}
              snapshotMenuItemsByLunchDay={{}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
