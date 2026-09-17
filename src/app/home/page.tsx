import { requireProfile } from "@/lib/auth";
import { StaffDashboard } from "@/components/dashboard/staff-dashboard";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { getStaffFinancialDashboardResult } from "@/lib/financial-summaries";
import {
  getLastFinalizedLunchPeriodSpend,
  getTimeOfDayGreeting,
  formatTimeRemainingUntilDeadline,
} from "@/lib/home-dashboard";
import { createClient } from "@/lib/supabase/server";
import { formatHumanDate } from "@/lib/format";
import { getJamaicaTodayDate } from "@/lib/datetime";

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = getJamaicaTodayDate();

  const [ctx, financialResult, recentOrdersResult] = await Promise.all([
    getStaffOrderingContext(profile.id),
    getStaffFinancialDashboardResult(supabase),
    supabase
      .from("orders")
      .select(`
        id,
        lunch_days!inner (
          lunch_date,
          lunch_providers ( name )
        )
      `)
      .eq("profile_id", profile.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const firstName = profile.full_name?.trim().split(/\s+/)[0] ?? "there";
  const hasOrderForDelivery = ctx.deliveryOrders.some(
    (order) => order.status === "submitted" || order.status === "fulfilled",
  );

  const currentPeriod =
    financialResult.status === "ready" ? financialResult.dashboard.current_period : null;

  const lastPeriod = await getLastFinalizedLunchPeriodSpend(
    supabase,
    profile.id,
    currentPeriod?.period_id ?? null,
  );

  const recentOrders =
    recentOrdersResult.data?.map((order) => {
      const lunchDay = Array.isArray(order.lunch_days) ? order.lunch_days[0] : order.lunch_days;
      const provider = lunchDay?.lunch_providers
        ? Array.isArray(lunchDay.lunch_providers)
          ? lunchDay.lunch_providers[0]
          : lunchDay.lunch_providers
        : null;

      return {
        id: order.id as string,
        providerName: provider?.name ?? "Lunch order",
        deliveryDate: lunchDay?.lunch_date ?? today,
      };
    }) ?? [];

  return (
    <StaffDashboard
      greeting={getTimeOfDayGreeting()}
      firstName={firstName}
      displayDateLabel={formatHumanDate(today)}
      orderingOpen={ctx.orderingOpen}
      deliveryDate={ctx.deliveryDate}
      cutoffTime={ctx.cutoffTime}
      orderDeadline={ctx.orderDeadline}
      timeRemainingLabel={formatTimeRemainingUntilDeadline(ctx.orderDeadline)}
      hasOrderForDelivery={hasOrderForDelivery}
      currentPeriodLabel={currentPeriod?.label ?? null}
      currentPeriodSpend={
        currentPeriod != null ? Number(currentPeriod.net_deduction) : null
      }
      lastPeriodLabel={lastPeriod?.label ?? null}
      lastPeriodSpend={lastPeriod?.amount ?? null}
      deliveryOrders={ctx.deliveryOrders}
      recentOrders={recentOrders}
    />
  );
}
