import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatDeadline } from "@/lib/format";
import { getCurrentLunchPeriod } from "@/lib/lunch-periods";
import { formatJamaicaWallClockTime } from "@/lib/settings";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { createClient } from "@/lib/supabase/server";
import { CurrentLunchPeriodCard } from "@/components/current-lunch-period-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { OrderSummaryCard } from "@/components/order-summary-card";
import { ProviderCard } from "@/components/provider-card";
import { linkButtonClass } from "@/components/ui/button";

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [ctx, currentPeriod] = await Promise.all([
    getStaffOrderingContext(profile.id),
    getCurrentLunchPeriod(supabase),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.full_name ?? "Staff"}`}
        description="Your daily lunch ordering overview."
      />

      <CurrentLunchPeriodCard period={currentPeriod} showStaffExport />

      {!ctx.orderWeekday ? (
        <Card className="mb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Ordering closed</h2>
                <StatusBadge status="closed" />
              </div>
              <p className="mt-2 text-sm text-muted">
                Lunch ordering is closed for the weekend. Ordering resumes
                Monday for Tuesday delivery.
              </p>
            </div>
            <Link href="/my-orders" className={linkButtonClass("secondary")}>
              View my orders
            </Link>
          </div>
        </Card>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card padding="sm">
            <p className="text-sm text-muted">Ordering status</p>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-lg font-semibold">
                {ctx.orderingOpen ? "Open" : "Closed"}
              </p>
              <StatusBadge status={ctx.orderingOpen ? "open" : "closed"} />
            </div>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-muted">Order date</p>
            <p className="mt-2 text-lg font-semibold">{ctx.orderDate}</p>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-muted">Delivery date</p>
            <p className="mt-2 text-lg font-semibold">{ctx.deliveryDate}</p>
          </Card>
          <Card padding="sm">
            <p className="text-sm text-muted">Cutoff</p>
            <p className="mt-2 text-lg font-semibold">
              {formatJamaicaWallClockTime(ctx.cutoffTime)}
            </p>
            {ctx.orderDeadline && (
              <p className="mt-1 text-xs text-muted">
                {formatDeadline(ctx.orderDeadline)}
              </p>
            )}
          </Card>
        </div>
      )}

      {ctx.orderWeekday && ctx.periodFinalized && (
        <Alert variant="info" className="mb-10">
          Ordering is unavailable because this lunch period has been finalized.
        </Alert>
      )}

      {ctx.orderWeekday && !ctx.periodFinalized && ctx.orderingOpen && (
        <section className="mb-10">
          <SectionHeader
            title="Place an order"
            description="You may place multiple separate orders before the cutoff."
            actions={
              <Link href="/lunch" className={linkButtonClass("primary")}>
                Order lunch
              </Link>
            }
          />

          {ctx.availableProviders.length === 0 ? (
            <EmptyState
              title="No providers available today"
              description="No active providers have menu items configured for today's order day."
            />
          ) : (
            <div className="space-y-4">
              {ctx.availableProviders.slice(0, 3).map((provider) => (
                <ProviderCard key={provider.id} {...provider} />
              ))}
              {ctx.availableProviders.length > 3 && (
                <Link href="/lunch" className={linkButtonClass("secondary")}>
                  View all {ctx.availableProviders.length} providers
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {ctx.orderWeekday && !ctx.periodFinalized && !ctx.orderingOpen && (
        <Alert variant="info" className="mb-10">
          Today&apos;s ordering window has closed. You can still review your
          orders for delivery on {ctx.deliveryDate}.
        </Alert>
      )}

      <section>
        <SectionHeader
          title={
            ctx.deliveryDate
              ? `Orders for delivery on ${ctx.deliveryDate}`
              : "Recent orders"
          }
          description="Each order is listed separately. You can place another order at any time before cutoff."
          actions={
            ctx.orderingOpen ? (
              <Link href="/lunch" className={linkButtonClass("primary")}>
                Place another order
              </Link>
            ) : undefined
          }
        />

        {ctx.deliveryOrders.length === 0 ? (
          <EmptyState
            title="No orders yet for this delivery date"
            description="When you place an order, it will appear here."
            action={
              ctx.orderingOpen ? (
                <Link href="/lunch" className={linkButtonClass("primary")}>
                  Order lunch
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {ctx.deliveryOrders.map((order) => (
              <OrderSummaryCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
