import { requireProfile } from "@/lib/auth";
import { HrPendingApprovalsAlert } from "@/components/dashboard/hr-pending-approvals-alert";
import { StaffDashboard } from "@/components/dashboard/staff-dashboard";
import {
  buildHrPendingSignupApprovalAlert,
  getHrPendingSignupApprovalCount,
} from "@/lib/hr-pending-signup-approvals";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { getStaffFinancialDashboardResult } from "@/lib/financial-summaries";
import {
  getLastFinalizedLunchPeriodSpend,
  getTimeOfDayGreeting,
  formatTimeRemainingUntilDeadline,
} from "@/lib/home-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getJamaicaTodayDate } from "@/lib/datetime";
import { loadStaffLateOrderRequestContext } from "@/app/home/staff-late-order-request-actions";
import { StaffLateOrderRequestPanel } from "@/components/dashboard/staff-late-order-request-panel";

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = getJamaicaTodayDate();

  const pendingSignupApprovalCount =
    profile.role === "hr"
      ? await getHrPendingSignupApprovalCount(supabase, profile.role)
      : 0;
  const hrPendingApprovalsAlert = buildHrPendingSignupApprovalAlert(
    pendingSignupApprovalCount,
  );

  const [ctx, financialResult, recentOrdersResult, lateRequestContext] = await Promise.all([
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
    loadStaffLateOrderRequestContext().catch(() => ({
      eligibleCycles: [],
      requests: [],
    })),
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
    <div className="space-y-6">
      {hrPendingApprovalsAlert ? (
        <HrPendingApprovalsAlert alert={hrPendingApprovalsAlert} />
      ) : null}
      <StaffDashboard
      greeting={getTimeOfDayGreeting()}
      firstName={firstName}
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
      <StaffLateOrderRequestPanel
        orderingOpen={ctx.orderingOpen}
        eligibleCycles={lateRequestContext.eligibleCycles}
        requests={lateRequestContext.requests}
      />
    </div>
  );
}
