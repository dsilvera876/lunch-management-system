import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { formatJamaicaWallClockTime } from "@/lib/settings";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { getStaffFinancialDashboardResult } from "@/lib/financial-summaries";
import {
  getCurrentOrdersState,
  getCurrentSpendState,
  getLocationDisplay,
  getProviderSetupMessage,
} from "@/lib/home-dashboard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [ctx, financialResult] = await Promise.all([
    getStaffOrderingContext(profile.id),
    getStaffFinancialDashboardResult(supabase),
  ]);

  const activeOrdersCount = ctx.deliveryOrders.filter(
    (order) => order.status === "submitted" || order.status === "fulfilled"
  ).length;

  const activeOrdersTotal = ctx.deliveryOrders
    .filter((order) => order.status === "submitted" || order.status === "fulfilled")
    .reduce((sum, order) => sum + order.total, 0);

  const [
    { data: profileRow, error: profileError },
    { count: activeLocationCount, error: locationsError },
  ] = await Promise.all([
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
    supabase
      .from("office_locations")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  if (profileError || locationsError) {
    throw new Error("Unable to load Home delivery settings.", {
      cause: profileError ?? locationsError,
    });
  }

  const defaultLocation = profileRow?.office_locations
    ? Array.isArray(profileRow.office_locations)
      ? profileRow.office_locations[0]
      : profileRow.office_locations
    : null;

  const defaultLocationName = defaultLocation?.is_active ? defaultLocation.name : null;
  const currentOrders = getCurrentOrdersState(
    activeOrdersCount,
    activeOrdersTotal,
  );
  const currentSpend =
    financialResult.status === "ready"
      ? getCurrentSpendState(financialResult.dashboard)
      : null;
  const providerSetupMessage = getProviderSetupMessage(
    ctx.availableProviders.length,
  );
  const locationDisplay = getLocationDisplay(
    activeLocationCount ?? 0,
    defaultLocationName,
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.full_name ?? "Staff"}`}
        description="Your daily lunch ordering overview."
      />

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card padding="md" className="flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Lunch</h2>
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Status</span>
              <StatusBadge status={ctx.orderingOpen ? "open" : "closed"} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Delivery</span>
              <span className="text-sm font-medium">{ctx.deliveryDate ?? "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Cutoff</span>
              <span className="text-sm font-medium">
                {formatJamaicaWallClockTime(ctx.cutoffTime)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Deliver to</span>
              <span className="text-sm font-medium truncate max-w-[150px] text-right">
                {locationDisplay}
              </span>
            </div>
            {providerSetupMessage && (
              <p className="text-sm text-muted">{providerSetupMessage}</p>
            )}
          </div>
          <div className="mt-6">
            <Link href="/lunch" className={linkButtonClass("primary") + " w-full justify-center"}>
              View Today&apos;s Lunch
            </Link>
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <h2 className="text-lg font-semibold mb-4">My Current Orders</h2>
          <div className="flex-1 space-y-3">
            {currentOrders.status === "empty" ? (
              <p className="text-sm text-muted">No orders today</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Active orders</span>
                  <span className="text-sm font-medium">{currentOrders.count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Total</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(currentOrders.total)}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="mt-6">
            <Link href="/my-orders" className={linkButtonClass("secondary") + " w-full justify-center"}>
              View My Orders
            </Link>
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Current Spend</h2>
          <div className="flex-1 space-y-3">
            {!currentSpend ? (
              <p className="text-sm text-red-700">
                Financial summary unavailable
              </p>
            ) : currentSpend.status === "no-period" ? (
              <p className="text-sm text-muted">No current lunch period</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Period deduction</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(currentSpend.netDeduction)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Daily subsidy</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(currentSpend.dailySubsidy)}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="mt-6">
            <Link href="/financials" className={linkButtonClass("secondary") + " w-full justify-center"}>
              View My Financials
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
