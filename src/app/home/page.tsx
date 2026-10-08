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
import {
  staffLateOrderActionKind,
  staffLateOrderActionLabel,
  staffLateOrderNewRequestAvailable,
} from "@/lib/staff-late-order-today";
import { MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF } from "@/lib/staff-late-order-submissions";
import {
  loadStaffLateOrderNewRequestSummary,
  loadStaffLateOrderRequestContext,
} from "@/app/home/staff-late-order-request-actions";
import { resolveLateOrderEligibilityOfficeLocationId } from "@/lib/staff-late-order-location-save";

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

  const [ctx, financialResult, recentOrdersResult, profileRow] = await Promise.all([
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
    supabase
      .from("profiles")
      .select(`
        default_office_location_id,
        office_locations:default_office_location_id (
          is_active
        )
      `)
      .eq("id", profile.id)
      .single(),
  ]);

  const homeDefaultLocation = profileRow.data?.office_locations
    ? Array.isArray(profileRow.data.office_locations)
      ? profileRow.data.office_locations[0]
      : profileRow.data.office_locations
    : null;
  const homeDefaultOfficeLocationInactive = Boolean(
    homeDefaultLocation && homeDefaultLocation.is_active === false,
  );

  const eligibilityOfficeLocationId = resolveLateOrderEligibilityOfficeLocationId(
    profileRow.data?.default_office_location_id ?? null,
    homeDefaultOfficeLocationInactive,
  );

  const [lateRequestContext, lateOrderSummary] = await Promise.all([
    loadStaffLateOrderRequestContext({ officeLocationId: eligibilityOfficeLocationId }),
    loadStaffLateOrderNewRequestSummary(),
  ]);
  const newLateOrderOpportunity = lateOrderSummary.available;

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

  const hasLateOrderRequests = lateRequestContext.requests.length > 0;
  const hasNewLateOrderOpportunity = staffLateOrderNewRequestAvailable(
    lateRequestContext,
    newLateOrderOpportunity,
  );

  const lateOrderRequestAvailable = !ctx.orderingOpen && hasNewLateOrderOpportunity;
  const lateOrderStatusAvailable =
    !ctx.orderingOpen && !lateOrderRequestAvailable && hasLateOrderRequests;
  const lateOrderActionLabel = staffLateOrderActionLabel(lateRequestContext, today, {
    newLateOrderOpportunity,
    summary: lateOrderSummary,
  });
  const lateOrderActionWhileOrderingOpen =
    ctx.orderingOpen && lateOrderActionLabel !== null;
  const lateOrderSecondaryHref =
    lateOrderActionWhileOrderingOpen && lateOrderActionLabel
      ? staffLateOrderActionKind(lateRequestContext, {
          newLateOrderOpportunity,
        }) === "status"
        ? MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF
        : "/lunch?lateOrder=1"
      : null;

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
      lateOrderRequestAvailable={lateOrderRequestAvailable}
      lateOrderStatusAvailable={lateOrderStatusAvailable}
      lateOrderActionWhileOrderingOpen={lateOrderActionWhileOrderingOpen}
      lateOrderActionLabel={lateOrderActionLabel}
      lateOrderSecondaryHref={lateOrderSecondaryHref}
      />
    </div>
  );
}
