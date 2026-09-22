import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getJamaicaTodayDate } from "@/lib/datetime";
import { buildOperationalDeliveryReport } from "@/lib/operational-orders";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import {
  buildTodaysOrdersSummaryMetrics,
  TODAYS_ORDERS_PAGE,
} from "@/lib/todays-orders-presentation";
import { TodaysOrdersPageHeader } from "@/components/admin/todays-orders/todays-orders-page-header";
import { TodaysProviderOrdersCard } from "@/components/admin/todays-orders/todays-provider-orders-card";
import { IconClipboard } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
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
  const summaryMetrics = buildTodaysOrdersSummaryMetrics(report);

  return (
    <div className="space-y-4">
      <TodaysOrdersPageHeader orderDate={orderDate} metrics={summaryMetrics} />

      {report.providers.length === 0 ? (
        <Card padding="sm" className="py-6 shadow-sm">
          <div className="flex items-start gap-3">
            <TealIconWell size="sm" className="shrink-0">
              <IconClipboard aria-hidden />
            </TealIconWell>
            <div>
              <p className="text-sm font-semibold text-slate-900">No orders today</p>
              <p className="mt-1 text-sm text-muted">{TODAYS_ORDERS_PAGE.emptyMessage}</p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {report.providers.map((provider) => (
            <TodaysProviderOrdersCard key={provider.providerId} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}
