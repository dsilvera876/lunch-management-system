import Link from "next/link";

import { requireProfile } from "@/lib/auth";

import { linkButtonClass } from "@/components/ui/button";

import { getStaffOrderingContext } from "@/lib/staff-ordering";

import { loadProviderMenusForOrderDate } from "@/lib/staff-provider-menu";

import { getDailyLunchSubsidy } from "@/lib/financial-summaries";

import { getLunchOrderErrorMessage } from "@/lib/lunch-order-errors";

import { getOrderingClosedReason } from "@/lib/ordering-ui";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/ui/page-header";

import { Alert } from "@/components/ui/alert";

import { EmptyState } from "@/components/ui/empty-state";

import { OrderingStatusBar } from "@/components/lunch/ordering-status-bar";

import { LunchOrderingShell } from "@/components/lunch/lunch-ordering-shell";

import {

  StaffLateOrderDrawerRoot,

  StaffLateOrderDrawerTrigger,

} from "@/components/lunch/staff-late-order-drawer";

import { loadStaffLateOrderRequestContext } from "@/app/home/staff-late-order-request-actions";

import { getJamaicaTodayDate } from "@/lib/datetime";

import { buildStaffLateOrderDrawerContext } from "@/lib/staff-late-order-today";



type Props = {

  searchParams: Promise<{

    error?: string;

    provider?: string;

    lateOrder?: string;

  }>;

};



export default async function LunchPage({ searchParams }: Props) {

  const profile = await requireProfile();

  const params = await searchParams;

  const ctx = await getStaffOrderingContext(profile.id);

  const supabase = await createClient();

  const todayDeliveryDate = getJamaicaTodayDate();



  const [{ data: profileRow }, dailySubsidy] = await Promise.all([

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

    ctx.businessDayOpen && ctx.orderWeekday && ctx.orderingOpen

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

    businessDayOpen: ctx.businessDayOpen,

    businessDayClosure: ctx.businessDayClosure,

    periodFinalized: ctx.periodFinalized,

    orderingOpen: ctx.orderingOpen,

  });



  const lateRequestContext = await loadStaffLateOrderRequestContext().catch(() => ({

    eligibleCycles: [],

    requests: [],

  }));



  const lateOrderDrawer = buildStaffLateOrderDrawerContext(lateRequestContext, todayDeliveryDate);

  const lateOrderDrawerProps = {
    deliveryDate: lateOrderDrawer.deliveryDate,
    jamaicaToday: todayDeliveryDate,
    orderingOpen: ctx.orderingOpen,
    eligibleCycles: lateOrderDrawer.context.eligibleCycles,
    requests: lateOrderDrawer.context.requests,
    highlightFromQuery: params.lateOrder === "1",
  } as const;



  return (

    <>

      <PageHeader

        title="Today's Order"

        staffAccessibleDescription

        description="Choose a provider and submit a separate order for that provider before today's cutoff."

        actions={

          <Link

            href="/my-orders"

            className={`${linkButtonClass("secondary")} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}

            aria-label="View my orders"

          >

            My orders

          </Link>

        }

      />



      {params.error && (

        <Alert variant="error" className="mb-6">

          {getLunchOrderErrorMessage(params.error)}

        </Alert>

      )}



      {lateOrderDrawer.visible && ctx.orderingOpen ? (
        <StaffLateOrderDrawerRoot {...lateOrderDrawerProps}>
          <div className="mb-4 flex justify-end">
            <StaffLateOrderDrawerTrigger />
          </div>
        </StaffLateOrderDrawerRoot>
      ) : null}



      {ctx.businessDayOpen && ctx.orderWeekday && ctx.orderingOpen && providerMenus.length > 0 ? (

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



      {ctx.businessDayOpen &&

        ctx.orderWeekday &&

        ctx.orderingOpen &&

        providerMenus.length === 0 &&

        !ctx.periodFinalized && (

          <EmptyState

            title="No providers available"

            description="No active providers have menu items available for ordering today."

          />

        )}



      {!ctx.orderingOpen && closedReason ? (

        lateOrderDrawer.visible ? (

          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">

            <h3 className="text-base font-medium text-foreground">Ordering closed today</h3>

            <p className="mx-auto mt-2 max-w-md text-sm text-muted">

              {closedReason.emptyStateDescription}

            </p>

            <div className="mt-4 flex justify-center">

              <StaffLateOrderDrawerRoot {...lateOrderDrawerProps}>

                <StaffLateOrderDrawerTrigger prominent />

              </StaffLateOrderDrawerRoot>

            </div>

          </div>

        ) : (

          <EmptyState

            title="Ordering closed today"

            description={closedReason.emptyStateDescription}

          />

        )

      ) : null}

    </>

  );

}


