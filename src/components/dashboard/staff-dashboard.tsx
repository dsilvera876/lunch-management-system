import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { RatingStars } from "@/components/ui/rating-stars";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, linkButtonClass } from "@/components/ui/button";
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
  lateOrderRequestAvailable: boolean;
  lateOrderTodayAvailable: boolean;
  lateOrderSecondaryLabel: string | null;
  hasLateOrderRequests: boolean;
};

export function StaffDashboard({
  greeting,
  firstName,
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
  lateOrderRequestAvailable,
  lateOrderTodayAvailable,
  lateOrderSecondaryLabel,
  hasLateOrderRequests,
}: Props) {
  const orderCtaLabel = hasOrderForDelivery ? "Order Again" : "Order Lunch";
  const deliveryLabel = deliveryDate ? formatHumanDate(deliveryDate) : null;
  const orderingCardLead = orderingOpen
    ? deliveryLabel
      ? `Order for ${deliveryLabel} on Today's Order before the cutoff.`
      : "Place orders on Today's Order before the cutoff."
    : lateOrderRequestAvailable
      ? deliveryLabel
        ? `Normal ordering has closed for ${deliveryLabel}.`
        : "Normal ordering has closed for today."
      : hasLateOrderRequests
        ? "Normal ordering is closed. Your late order request status is on Today's Order."
        : deliveryLabel
          ? `Ordering is closed for ${deliveryLabel}.`
          : "Ordering is closed for today.";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-staff-instruction">
          {greeting},
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Welcome back, {firstName}!
        </h1>
        <p className="mt-2 text-sm text-staff-instruction">
          Here&apos;s your lunch overview
          {deliveryLabel ? ` for ${deliveryLabel}` : " for your next delivery"}.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-staff-teal">
                <IconUtensils size={22} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Next Lunch Ordering</h2>
                <p className="mt-1 text-sm text-staff-instruction">{orderingCardLead}</p>
              </div>
            </div>
            <StatusBadge status={orderingOpen ? "open" : "closed"} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-staff-instruction">
                Order cutoff time
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatJamaicaWallClockTime(cutoffTime)}
              </p>
              {orderDeadline && deliveryDate ? (
                <p className="mt-0.5 text-xs text-staff-instruction">{formatDisplayDate(deliveryDate)}</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-staff-instruction">
                Time remaining
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {timeRemainingLabel ?? "Not available"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            {orderingOpen ? (
              <>
                <Link
                  href="/lunch"
                  className={`${linkButtonClass("primary", { staffPrimaryCta: true })} min-h-12 w-full max-w-full justify-center gap-2 px-5 py-3 text-base font-semibold`}
                >
                  {orderCtaLabel}
                  <IconArrowRight size={18} className="opacity-90" />
                </Link>
                <p className="mt-2 text-xs text-staff-instruction">
                  You&apos;ll be taken to Today&apos;s Order. Ordering is not completed from the
                  dashboard.
                </p>
                {lateOrderTodayAvailable && lateOrderSecondaryLabel ? (
                  <Link
                    href="/lunch?lateOrder=1"
                    className={`${linkButtonClass("secondary")} mt-3 min-h-10 w-full max-w-full justify-center px-5 py-2 text-sm font-medium`}
                  >
                    {lateOrderSecondaryLabel}
                  </Link>
                ) : null}
              </>
            ) : lateOrderRequestAvailable ? (
              <>
                <p className="text-sm text-staff-instruction">
                  Normal ordering has closed. You can still request a late order before the provider
                  cutoff.
                </p>
                <Link
                  href="/lunch?lateOrder=1"
                  className={`${linkButtonClass("primary", { staffPrimaryCta: true })} mt-3 min-h-12 w-full max-w-full justify-center gap-2 px-5 py-3 text-base font-semibold`}
                >
                  Request a late order
                  <IconArrowRight size={18} className="opacity-90" />
                </Link>
                <p className="mt-2 text-xs text-staff-instruction">
                  You&apos;ll submit the request on Today&apos;s Order. HR must review it before an
                  order is placed.
                </p>
              </>
            ) : hasLateOrderRequests ? (
              <>
                <Link
                  href="/lunch"
                  className={`${linkButtonClass("secondary")} min-h-12 w-full max-w-full justify-center gap-2 px-5 py-3 text-base font-semibold`}
                >
                  View Today&apos;s Order
                  <IconArrowRight size={18} className="opacity-90" />
                </Link>
                <p className="mt-2 text-xs text-staff-instruction">
                  Your late order request status is on Today&apos;s Order.
                </p>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled
                  aria-disabled
                  className="min-h-12 w-full max-w-full justify-center gap-2 px-5 py-3 text-base font-semibold"
                >
                  Lunch Ordering Closed
                </Button>
                <p className="mt-2 text-xs text-staff-instruction">
                  Normal ordering is closed and late order requests are not available right now.
                </p>
              </>
            )}
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
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-staff-teal">
              <IconBag size={18} />
            </span>
            <h2 className="text-base font-semibold text-slate-900">Your Next Lunch Order</h2>
          </div>
          {deliveryOrders.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                compact
                title="No order placed for your next lunch yet."
                description={
                  lateOrderRequestAvailable
                    ? "Use Request a late order above to ask HR for a late lunch."
                    : orderingOpen
                      ? "Select Order Lunch above to choose your lunch."
                      : hasLateOrderRequests
                        ? "View Today's Order above to see your late order request status."
                        : "Normal ordering is closed for your next delivery."
                }
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
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-staff-teal">
                <IconStarOutline size={18} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">Rate Recent Orders</h2>
            </div>
            <Link href="/my-orders" className="inline-flex min-h-10 items-center text-sm font-medium text-staff-teal hover:underline">
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="mt-3 text-sm text-staff-instruction">
              Recent orders will appear here after you place lunch orders.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{order.providerName}</p>
                    <p className="text-xs text-staff-instruction">
                      {formatHumanDate(order.deliveryDate)}
                    </p>
                  </div>
                  <RatingStars value={0} readOnly label={`Rate ${order.providerName}`} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-staff-instruction">
            Ratings are display-only until a rating workflow is configured.
          </p>
        </Card>
      </div>
    </div>
  );
}
