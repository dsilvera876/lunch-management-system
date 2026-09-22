import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { RatingStars } from "@/components/ui/rating-stars";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { DashboardOrderSummary } from "@/components/dashboard/dashboard-order-summary";
import {
  IconArrowRight,
  IconBag,
  IconChart,
  IconStarOutline,
  IconUtensils,
  IconWallet,
} from "@/components/icons/line-icons";
import { formatCurrency, formatHumanDate } from "@/lib/format";
import { formatJamaicaWallClockTime } from "@/lib/settings";
import { formatDisplayDate } from "@/lib/ordering-ui";
import type { DeliveryOrderSummary } from "@/lib/staff-ordering";

type Props = {
  greeting: string;
  firstName: string;
  displayDateLabel: string;
  orderingOpen: boolean;
  deliveryDate: string | null;
  cutoffTime: string;
  orderDeadline: string | null;
  timeRemainingLabel: string | null;
  hasOrderForDelivery: boolean;
  currentPeriodLabel: string | null;
  currentPeriodSpend: number | null;
  lastPeriodLabel: string | null;
  lastPeriodSpend: number | null;
  deliveryOrders: DeliveryOrderSummary[];
  recentOrders: Array<{
    id: string;
    providerName: string;
    deliveryDate: string;
  }>;
};

export function StaffDashboard({
  greeting,
  firstName,
  displayDateLabel,
  orderingOpen,
  deliveryDate,
  cutoffTime,
  orderDeadline,
  timeRemainingLabel,
  hasOrderForDelivery,
  currentPeriodLabel,
  currentPeriodSpend,
  lastPeriodLabel,
  lastPeriodSpend,
  deliveryOrders,
  recentOrders,
}: Props) {
  const orderCtaLabel = hasOrderForDelivery ? "Order Again" : "Order Lunch";
  const deliveryLabel = deliveryDate ? formatHumanDate(deliveryDate) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">{greeting},</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-2 text-sm text-muted">
            Here&apos;s your lunch overview
            {deliveryLabel ? ` for ${deliveryLabel}` : " for your next delivery"}.
          </p>
        </div>
        <p className="text-sm text-muted">{displayDateLabel}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconUtensils size={22} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Next Lunch Ordering</h2>
                <p className="mt-1 text-sm text-muted">
                  {deliveryLabel
                    ? `Order for ${deliveryLabel} on the Order Lunch page before the cutoff.`
                    : "Place orders on the Order Lunch page before the cutoff."}
                </p>
              </div>
            </div>
            <StatusBadge status={orderingOpen ? "open" : "closed"} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Order cutoff time</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatJamaicaWallClockTime(cutoffTime)}
              </p>
              {orderDeadline && deliveryDate ? (
                <p className="mt-0.5 text-xs text-muted">{formatDisplayDate(deliveryDate)}</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Time remaining</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {timeRemainingLabel ?? "Not available"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <Link
              href="/lunch"
              className={`${linkButtonClass("primary")} min-h-12 w-full max-w-full justify-center gap-2 px-5 py-3 text-base font-semibold`}
            >
              {orderCtaLabel}
              <IconArrowRight size={18} className="opacity-90" />
            </Link>
            <p className="mt-2 text-xs text-muted">
              You&apos;ll be taken to the Order Lunch page. Ordering is not completed from the dashboard.
            </p>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            title="Current Lunch Period Spend"
            subtitle={currentPeriodLabel ?? "No open lunch period"}
            value={currentPeriodSpend != null ? formatCurrency(currentPeriodSpend) : "—"}
            icon={<IconWallet size={18} />}
          />
          <MetricCard
            title="Last Lunch Period Spend"
            subtitle={lastPeriodLabel ?? "No finalized period yet"}
            value={lastPeriodSpend != null ? formatCurrency(lastPeriodSpend) : "—"}
            icon={<IconChart size={18} />}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconBag size={18} />
            </span>
            <h2 className="text-base font-semibold text-slate-900">Your Next Lunch Order</h2>
          </div>
          {deliveryOrders.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                compact
                title="No order placed for your next lunch yet."
                description="Select Order Lunch above to choose your lunch."
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {deliveryOrders.map((order) => (
                <li key={order.id}>
                  <DashboardOrderSummary order={order} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconStarOutline size={18} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">Rate Recent Orders</h2>
            </div>
            <Link href="/my-orders" className="text-sm font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Recent orders will appear here after you place lunch orders.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{order.providerName}</p>
                    <p className="text-xs text-muted">{formatHumanDate(order.deliveryDate)}</p>
                  </div>
                  <RatingStars value={0} readOnly label={`Rate ${order.providerName}`} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Ratings are display-only until a rating workflow is configured.
          </p>
        </Card>
      </div>
    </div>
  );
}
