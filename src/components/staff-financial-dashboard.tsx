import Link from "next/link";
import { formatLunchPeriodRange } from "@/lib/lunch-periods";
import { formatMoney } from "@/lib/format";
import type { StaffFinancialDashboard } from "@/lib/financial-summaries";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  dashboard: StaffFinancialDashboard;
  canExport: boolean;
};

export function StaffFinancialDashboardView({ dashboard, canExport }: Props) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card padding="sm">
          <p className="text-sm text-muted">Today</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatMoney(dashboard.today_total)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Non-cancelled orders with today&apos;s Jamaica order date
          </p>
        </Card>

        <Card padding="sm">
          <p className="text-sm text-muted">Current month</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatMoney(dashboard.current_month_total)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Jamaica calendar month to date
          </p>
        </Card>

        <Card padding="sm" className="md:col-span-2 xl:col-span-1">
          <p className="text-sm text-muted">Recent months</p>
          <ul className="mt-3 space-y-2">
            {dashboard.recent_months.map((month) => (
              <li
                key={`${month.year}-${month.month}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{month.label.trim()}</span>
                <span className="font-medium">{formatMoney(month.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Current lunch period"
          description="Totals use order date, not delivery date."
          actions={
            canExport ? (
              <Link href="/financials/export" className={linkButtonClass("primary")}>
                Export My Summary
              </Link>
            ) : (
              <span className="text-sm text-muted">Export unavailable</span>
            )
          }
        />

        {dashboard.current_period ? (
          <div className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">
                  {dashboard.current_period.label}
                </h3>
                {dashboard.current_period.status === "finalized" ? (
                  <StatusBadge status="closed" />
                ) : (
                  <StatusBadge status="open" />
                )}
              </div>
              <p className="mt-2 text-sm text-muted">
                {formatLunchPeriodRange(
                  dashboard.current_period.start_date,
                  dashboard.current_period.end_date,
                )}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted">Period total</p>
                  <p className="text-xl font-semibold">
                    {formatMoney(dashboard.current_period.period_total)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted">Qualifying orders</p>
                  <p className="text-xl font-semibold">
                    {dashboard.current_period.order_count}
                  </p>
                </div>
              </div>
            </div>

            {dashboard.current_period.orders.length === 0 ? (
              <EmptyState
                title="No qualifying orders in this period"
                description="Submitted and fulfilled orders with order dates in this period will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="px-3 py-2 font-medium">Order date</th>
                      <th className="px-3 py-2 font-medium">Delivery</th>
                      <th className="px-3 py-2 font-medium">Provider</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.current_period.orders.map((order) => (
                      <tr key={order.order_id} className="border-b border-border/70">
                        <td className="px-3 py-2">{order.order_date}</td>
                        <td className="px-3 py-2">{order.delivery_date}</td>
                        <td className="px-3 py-2">{order.provider_name ?? "—"}</td>
                        <td className="px-3 py-2 capitalize">{order.order_status}</td>
                        <td className="px-3 py-2 text-right">
                          {formatMoney(order.order_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="No current lunch period"
            description="Your administrator has not marked a current payroll period yet."
          />
        )}
      </Card>
    </div>
  );
}
