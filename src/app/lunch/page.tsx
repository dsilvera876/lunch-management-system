import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatDeadline } from "@/lib/format";
import { formatJamaicaWallClockTime } from "@/lib/settings";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ProviderCard } from "@/components/provider-card";
import { OrderSummaryCard } from "@/components/order-summary-card";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    error?: string;
    ordered?: string;
  }>;
};

export default async function LunchPage({ searchParams }: Props) {
  const profile = await requireProfile();
  const params = await searchParams;
  const ctx = await getStaffOrderingContext(profile.id);
  const supabase = await createClient();

  const { data: legacyLunchDays } = await supabase
    .from("lunch_days")
    .select(`
      id,
      lunch_date,
      order_deadline,
      notes,
      menu_items (
        id,
        is_active
      )
    `)
    .eq("status", "open")
    .is("provider_id", null)
    .gt("order_deadline", new Date().toISOString())
    .order("lunch_date", { ascending: true });

  return (
    <>
      <PageHeader
        title="Order Lunch"
        description="Choose a provider and submit a separate order. You may place unlimited orders before the cutoff."
      />

      {params.ordered && (
        <Alert variant="success" className="mb-6">
          Your order was submitted successfully.
        </Alert>
      )}

      {params.error && (
        <Alert variant="error" className="mb-6">
          Unable to complete the request. Please try again.
        </Alert>
      )}

      {!ctx.orderWeekday ? (
        <EmptyState
          title="Ordering closed for the weekend"
          description="Lunch ordering is closed for the weekend. Ordering resumes Monday for Tuesday delivery."
        />
      ) : (
        <>
          <Card className="mb-8" padding="sm">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted">Order date</dt>
                <dd className="mt-1 font-semibold">{ctx.orderDate}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Delivery date</dt>
                <dd className="mt-1 font-semibold">{ctx.deliveryDate}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Cutoff</dt>
                <dd className="mt-1 font-semibold">
                  {formatJamaicaWallClockTime(ctx.cutoffTime)}
                </dd>
                {ctx.orderDeadline && (
                  <dd className="mt-1 text-xs text-muted">
                    {formatDeadline(ctx.orderDeadline)}
                  </dd>
                )}
              </div>
            </dl>
          </Card>

          {!ctx.periodFinalized ? (
            <>
              {!ctx.orderingOpen ? (
                <Alert variant="info" className="mb-8">
                  Today&apos;s ordering window has closed.
                </Alert>
              ) : ctx.availableProviders.length === 0 ? (
                <EmptyState
                  title="No providers available"
                  description="No active providers have menu items available for ordering today."
                />
              ) : (
                <section className="mb-10">
                  <SectionHeader title="Available providers" />
                  <div className="space-y-4">
                    {ctx.availableProviders.map((provider) => (
                      <ProviderCard key={provider.id} {...provider} />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <Alert variant="info" className="mb-8">
              Ordering is unavailable because this lunch period has been finalized.
            </Alert>
          )}
        </>
      )}

      {ctx.deliveryOrders.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            title={`Today's orders for delivery on ${ctx.deliveryDate}`}
            actions={
              ctx.orderingOpen ? (
                <span className="text-sm text-muted">
                  You can still place another order below.
                </span>
              ) : undefined
            }
          />
          <div className="space-y-4">
            {ctx.deliveryOrders.map((order) => (
              <OrderSummaryCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}

      {legacyLunchDays && legacyLunchDays.length > 0 && (
        <section className="border-t border-border pt-8">
          <SectionHeader
            title="Legacy open lunches"
            description="Manually configured lunch days (being phased out)."
          />
          <div className="space-y-3">
            {legacyLunchDays.map((day) => {
              const activeItems = day.menu_items.filter((item) => item.is_active);

              return (
                <Card key={day.id} padding="sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{day.lunch_date}</p>
                      <p className="text-sm text-muted">
                        {activeItems.length} items · Order by{" "}
                        {formatDeadline(day.order_deadline)}
                      </p>
                    </div>
                    <Link
                      href={`/lunch/${day.id}`}
                      className={linkButtonClass("secondary")}
                    >
                      Place an order
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
