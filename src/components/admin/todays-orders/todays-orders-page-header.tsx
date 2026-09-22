import { TODAYS_ORDERS_PAGE } from "@/lib/todays-orders-presentation";
import { formatJamaicaHeaderDate } from "@/lib/datetime";
import type { TodaysOrdersSummaryMetrics } from "@/lib/todays-orders-presentation";
import { TodaysOrdersSummary } from "@/components/admin/todays-orders/todays-orders-summary";
import { IconCalendar } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { Card } from "@/components/ui/card";

type Props = {
  orderDate: string;
  metrics: TodaysOrdersSummaryMetrics;
};

export function TodaysOrdersPageHeader({ orderDate, metrics }: Props) {
  return (
    <Card padding="sm" className="mb-6 py-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 gap-3">
          <TealIconWell size="sm" className="mt-0.5 shrink-0">
            <IconCalendar aria-hidden />
          </TealIconWell>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {TODAYS_ORDERS_PAGE.title}
            </h1>
            <p className="mt-0.5 text-sm font-medium text-slate-600">
              {formatJamaicaHeaderDate(orderDate)}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              {TODAYS_ORDERS_PAGE.description}
            </p>
          </div>
        </div>
        <TodaysOrdersSummary metrics={metrics} />
      </div>
    </Card>
  );
}
