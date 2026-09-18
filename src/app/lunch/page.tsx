import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatDeadline } from "@/lib/format";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { loadProviderMenusForOrderDate } from "@/lib/staff-provider-menu";
import { getDailyLunchSubsidy } from "@/lib/financial-summaries";
import { getLunchOrderErrorMessage } from "@/lib/lunch-order-errors";
import { getOrderingClosedReason } from "@/lib/ordering-ui";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderingStatusBar } from "@/components/lunch/ordering-status-bar";
import { LunchOrderingShell } from "@/components/lunch/lunch-ordering-shell";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{
    error?: string;
    provider?: string;
  }>;
};

export default async function LunchPage({ searchParams }: Props) {
  const profile = await requireProfile();
  const params = await searchParams;
  const ctx = await getStaffOrderingContext(profile.id);
  const supabase = await createClient();

  const [{ data: legacyLunchDays }, { data: profileRow }, dailySubsidy] =
    await Promise.all([
      supabase
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
        .order("lunch_date", { ascending: true }),

      supabase
        .from("profiles")
        .select(`
          default_office_location_id,
          office_locations:default_office_location_id (
            name,
            is_active
          )
        `)
        .eq("id", profile.id)
        .single(),

      getDailyLunchSubsidy(supabase),
    ]);

  const defaultLocation = profileRow?.office_locations
    ? Array.isArray(profileRow.office_locations)
      ? profileRow.office_locations[0]
      : profileRow.office_locations
    : null;

  const defaultLocationName = defaultLocation?.is_active ? defaultLocation.name : null;

  const providerMenus =
    ctx.orderWeekday && ctx.orderingOpen
      ? await loadProviderMenusForOrderDate(
          supabase,
          ctx.orderDate,
          ctx.orderWeekday,
        )
      : [];

  const { data: officeLocations } = await supabase
    .from("office_locations")
    .select("id, name, address, description")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const existingOrderDateGross = ctx.deliveryOrders
    .filter((order) => order.orderDate === ctx.orderDate)
    .reduce((sum, order) => sum + order.total, 0);

  const closedReason = getOrderingClosedReason({
    orderWeekday: ctx.orderWeekday,
    periodFinalized: ctx.periodFinalized,
    orderingOpen: ctx.orderingOpen,
  });

  return (
    <>
      <PageHeader
        title="Today's Order"
        description="Choose a provider and submit a separate order for that provider before today's cutoff."
      />

      {params.error && (
        <Alert variant="error" className="mb-6">
          {getLunchOrderErrorMessage(params.error)}
        </Alert>
      )}

      {ctx.orderWeekday && ctx.orderingOpen && providerMenus.length > 0 ? (
        <LunchOrderingShell
          providers={providerMenus}
          initialProviderId={params.provider ?? null}
          orderDate={ctx.orderDate}
          orderingOpen={ctx.orderingOpen}
          dailySubsidy={Number(dailySubsidy)}
          existingOrderDateGross={existingOrderDateGross}
          officeLocations={officeLocations ?? []}
          defaultOfficeLocationId={profileRow?.default_office_location_id ?? null}
          defaultOfficeLocationName={defaultLocation?.name ?? null}
          defaultOfficeLocationInactive={Boolean(
            defaultLocation && defaultLocation.is_active === false,
          )}
          deliveryDate={ctx.deliveryDate}
          cutoffTime={ctx.cutoffTime}
          orderDeadline={ctx.orderDeadline}
          closedMessage={closedReason?.description}
        />
      ) : (
        <OrderingStatusBar
          orderingOpen={ctx.orderingOpen}
          deliveryDate={ctx.deliveryDate}
          cutoffTime={ctx.cutoffTime}
          orderDeadline={ctx.orderDeadline}
          closedMessage={closedReason?.description}
          locationName={defaultLocationName}
        />
      )}

      {ctx.orderWeekday &&
        ctx.orderingOpen &&
        providerMenus.length === 0 &&
        !ctx.periodFinalized && (
          <EmptyState
            title="No providers available"
            description="No active providers have menu items available for ordering today."
          />
        )}

      {!ctx.orderingOpen && closedReason ? (
        <EmptyState title={closedReason.title} description={closedReason.description} />
      ) : null}

      {legacyLunchDays && legacyLunchDays.length > 0 && (
        <section className="mt-10 border-t border-border pt-8">
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
