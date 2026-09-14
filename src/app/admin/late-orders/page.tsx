import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getJamaicaTodayDate, getOrderDateForDeliveryDate } from "@/lib/datetime";
import { getRelated } from "@/lib/format";
import { listHrLateOrderCreationCycles } from "@/lib/hr-late-order-create";
import {
  candidateLateOrderDeliveryDates,
  classifyLateOrderSnapshotWarning,
  resolvePrimaryLateOrderDeliveryDate,
  shouldShowLateOrderProviderSummary,
} from "@/lib/late-order-cycle";
import {
  formatAutomaticSupplementScheduleLabel,
  formatLateOrderTimeLabel,
  formatSupplementDispatchStatusLabel,
  isAutomaticSupplementDue,
  isProviderLateOrderingOpen,
  type SupplementDispatchRecord,
} from "@/lib/late-orders";
import {
  buildSentLateOrderDispatchMap,
  countEligibleLateOrdersForSupplementSend,
  resolveLateOrderRowDispatchDisplay,
  type LateOrderDispatchMembershipRow,
} from "@/lib/late-order-per-order-status";
import { OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY } from "@/lib/operational-orders-data";
import { LateOrdersWorkspace } from "@/components/admin/late-orders-workspace";
import { PageHeader } from "@/components/ui/page-header";

function formatLateOrderDeadlineSummary(
  deadlineDay: string | null,
  deadlineTime: string | null,
): string {
  if (!deadlineDay || !deadlineTime) {
    return "Late deadline not configured";
  }

  const dayLabel = deadlineDay === "delivery_day" ? "delivery day" : "order day";
  return `Late orders accepted until ${formatLateOrderTimeLabel(deadlineTime)} on ${dayLabel}`;
}

export default async function LateOrdersPage() {
  await requireViewAllOrders();
  const supabase = await createClient();
  const today = getJamaicaTodayDate();
  const now = new Date();
  const deliveryDatesToLoad = candidateLateOrderDeliveryDates(today);

  const [{ data: providers }, { data: employees }, { data: locations }] = await Promise.all([
    supabase
      .from("lunch_providers")
      .select(
        "id, name, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, automatic_supplement_send_day, automatic_supplement_send_time, primary_order_email",
      )
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name", { ascending: true }),
    supabase
      .from("office_locations")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const providerSummaries = [];

  for (const provider of providers ?? []) {
    for (const deliveryDate of deliveryDatesToLoad) {
      const orderDateFromRpc = await supabase.rpc("order_date_for_delivery_date", {
        p_delivery_date: deliveryDate,
      });

      const orderDate =
        orderDateFromRpc.data != null
          ? String(orderDateFromRpc.data)
          : getOrderDateForDeliveryDate(deliveryDate);

      if (!orderDate) {
        continue;
      }

      const { data: companyDeadlinePassed } = await supabase.rpc("order_deadline_for_order_date", {
        p_order_date: orderDate,
      });

      const cutoffPassed = companyDeadlinePassed
        ? now.getTime() > new Date(String(companyDeadlinePassed)).getTime()
        : false;

      const lateOpen = isProviderLateOrderingOpen(
        {
          acceptsLateOrders: provider.accepts_late_orders,
          lateOrderDeadlineDay: provider.late_order_deadline_day,
          lateOrderDeadlineTime: provider.late_order_deadline_time,
        },
        orderDate,
        deliveryDate,
        now,
        cutoffPassed,
      );

      const { data: snapshotRow } = await supabase
        .from("lunch_days")
        .select("id, order_date, lunch_date")
        .eq("provider_id", provider.id)
        .eq("order_date", orderDate)
        .eq("lunch_date", deliveryDate)
        .maybeSingle();

      const snapshotMissing = !snapshotRow;
      const snapshotWarning = classifyLateOrderSnapshotWarning({
        snapshotMissing,
        orderDate,
        jamaicaToday: today,
        deliveryDate,
      });

      const { data: dispatchMembershipRows } = await supabase
        .from("provider_late_order_dispatch_orders")
        .select(
          "order_id, provider_late_order_dispatches!inner(provider_id, scheduled_delivery_date, status, sent_at)",
        )
        .eq("provider_late_order_dispatches.provider_id", provider.id)
        .eq("provider_late_order_dispatches.scheduled_delivery_date", deliveryDate);

      const sentByOrderId = buildSentLateOrderDispatchMap(
        (dispatchMembershipRows ?? []).map((row) => {
          const dispatch = getRelated(
            row.provider_late_order_dispatches as
              | { status: string; sent_at: string | null }
              | { status: string; sent_at: string | null }[]
              | null,
          );

          return {
            orderId: row.order_id as string,
            dispatchStatus: dispatch?.status ?? "",
            sentAt: (dispatch?.sent_at as string | null) ?? null,
          } satisfies LateOrderDispatchMembershipRow;
        }),
      );

      const { data: lateOrders } = await supabase
        .from("orders")
        .select(
          `
          id,
          created_at,
          profiles!${OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY} ( full_name ),
          lunch_days!inner ( lunch_date, order_date, provider_id )
        `,
        )
        .eq("is_late_order", true)
        .eq("lunch_days.provider_id", provider.id)
        .eq("lunch_days.lunch_date", deliveryDate)
        .order("created_at", { ascending: false });

      const lateOrderIds = (lateOrders ?? []).map((order) => order.id as string);

      const [{ data: dispatchRows }, { data: opportunityRow }] = await Promise.all([
        supabase
          .from("provider_late_order_dispatches")
          .select(
            "id, status, dispatch_type, sent_at, error_summary, created_at, message_metadata",
          )
          .eq("provider_id", provider.id)
          .eq("scheduled_delivery_date", deliveryDate)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("provider_late_order_automatic_opportunities")
          .select("outcome, processed_at, late_order_count")
          .eq("provider_id", provider.id)
          .eq("scheduled_delivery_date", deliveryDate)
          .maybeSingle(),
      ]);

      const dispatchSummariesForOrders = (dispatchRows ?? []).map((row) => ({
        status: row.status as string,
        messageMetadata: row.message_metadata,
      }));

      const approvedUnsent = countEligibleLateOrdersForSupplementSend(
        lateOrderIds,
        sentByOrderId,
        dispatchSummariesForOrders,
      );

      const latestDispatch: SupplementDispatchRecord | null = dispatchRows?.[0]
        ? {
            status: dispatchRows[0].status as string,
            dispatchType: dispatchRows[0].dispatch_type as string,
            sentAt: (dispatchRows[0].sent_at as string | null) ?? null,
            errorSummary: (dispatchRows[0].error_summary as string | null) ?? null,
            createdAt: dispatchRows[0].created_at as string,
          }
        : null;

      const hasBlockingDispatch = (dispatchRows ?? []).some((row) =>
        row.status === "pending" || row.status === "attention_required",
      );

      const automaticDue = isAutomaticSupplementDue(
        {
          supplementalDispatchMode: provider.supplemental_dispatch_mode,
          automaticSupplementSendDay: provider.automatic_supplement_send_day,
          automaticSupplementSendTime: provider.automatic_supplement_send_time,
          lateOrderDeadlineDay: provider.late_order_deadline_day,
          lateOrderDeadlineTime: provider.late_order_deadline_time,
        },
        orderDate,
        deliveryDate,
        now,
      );

      const automaticOpportunity = opportunityRow
        ? {
            outcome: opportunityRow.outcome as string,
            processedAt: opportunityRow.processed_at as string,
            lateOrderCount: opportunityRow.late_order_count as number,
          }
        : null;

      const supplementStatusLabel = formatSupplementDispatchStatusLabel({
        dispatchMode: provider.supplemental_dispatch_mode,
        approvedUnsentCount: approvedUnsent,
        lateOrderingOpen: lateOpen,
        automaticDue,
        snapshotMissing,
        latestDispatch,
        automaticOpportunity,
        now,
      });

      const attentionDispatchId =
        dispatchRows?.find((row) => row.status === "attention_required")?.id ?? null;

      const lateOrderCount = lateOrders?.length ?? 0;

      const summary = {
        providerId: provider.id,
        providerName: provider.name,
        deliveryDate,
        orderDate,
        acceptsLateOrders: provider.accepts_late_orders,
        deadlineSummary: formatLateOrderDeadlineSummary(
          provider.late_order_deadline_day,
          provider.late_order_deadline_time,
        ),
        lateOrderingOpen: lateOpen,
        approvedUnsentCount: approvedUnsent,
        dispatchMode: provider.supplemental_dispatch_mode,
        automaticScheduleLabel: formatAutomaticSupplementScheduleLabel({
          supplementalDispatchMode: provider.supplemental_dispatch_mode,
          automaticSupplementSendDay: provider.automatic_supplement_send_day,
          automaticSupplementSendTime: provider.automatic_supplement_send_time,
        }),
        supplementStatusLabel,
        snapshotMissing,
        snapshotWarningMessage: snapshotWarning.message,
        hasBlockingDispatch,
        attentionDispatchId,
        primaryOrderEmail: provider.primary_order_email,
        lateOrders: (lateOrders ?? []).map((order) => {
          const profile = getRelated(
            order.profiles as { full_name: string | null } | { full_name: string | null }[] | null,
          );
          const orderId = order.id as string;
          const dispatchDisplay = resolveLateOrderRowDispatchDisplay(
            orderId,
            sentByOrderId,
            dispatchSummariesForOrders,
          );

          return {
            id: orderId,
            employeeName: profile?.full_name?.trim() || "Employee",
            createdAt: order.created_at as string,
            dispatchDisplay,
          };
        }),
        lateOrderCount,
      };

      if (
        !summary.acceptsLateOrders &&
        !shouldShowLateOrderProviderSummary({
          lateOrderingOpen: summary.lateOrderingOpen,
          approvedUnsentCount: summary.approvedUnsentCount,
          hasBlockingDispatch: summary.hasBlockingDispatch,
          attentionDispatchId: summary.attentionDispatchId,
          lateOrderCount: summary.lateOrderCount,
        })
      ) {
        continue;
      }

      if (
        shouldShowLateOrderProviderSummary({
          lateOrderingOpen: summary.lateOrderingOpen,
          approvedUnsentCount: summary.approvedUnsentCount,
          hasBlockingDispatch: summary.hasBlockingDispatch,
          attentionDispatchId: summary.attentionDispatchId,
          lateOrderCount: summary.lateOrderCount,
        })
      ) {
        providerSummaries.push(summary);
      }
    }
  }

  const openDeliveryDates = [
    ...new Set(
      providerSummaries.filter((summary) => summary.lateOrderingOpen).map((s) => s.deliveryDate),
    ),
  ];

  const primaryDeliveryDate = resolvePrimaryLateOrderDeliveryDate(openDeliveryDates, today);

  const lateOrderProviders = (providers ?? [])
    .filter((provider) => provider.accepts_late_orders)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
    }));

  const orderDatesForCutoff = new Set<string>();

  for (const deliveryDate of deliveryDatesToLoad) {
    const orderDate = getOrderDateForDeliveryDate(deliveryDate);

    if (orderDate) {
      orderDatesForCutoff.add(orderDate);
    }
  }

  const cutoffByOrderDate: Record<string, boolean> = {};

  await Promise.all(
    [...orderDatesForCutoff].map(async (orderDate) => {
      const { data: companyDeadlinePassed } = await supabase.rpc("order_deadline_for_order_date", {
        p_order_date: orderDate,
      });

      cutoffByOrderDate[orderDate] = companyDeadlinePassed
        ? now.getTime() > new Date(String(companyDeadlinePassed)).getTime()
        : false;
    }),
  );

  const providerCreationCycles: Record<
    string,
    ReturnType<typeof listHrLateOrderCreationCycles>
  > = {};

  for (const provider of providers ?? []) {
    providerCreationCycles[provider.id] = listHrLateOrderCreationCycles({
      today,
      now,
      provider: {
        acceptsLateOrders: provider.accepts_late_orders,
        lateOrderDeadlineDay: provider.late_order_deadline_day,
        lateOrderDeadlineTime: provider.late_order_deadline_time,
      },
      isCompanyCutoffPassed: (orderDate) => cutoffByOrderDate[orderDate] ?? false,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Late Orders"
        description="Create HR late-order exceptions after the normal company cutoff and send supplemental provider emails."
      />
      <LateOrdersWorkspace
        providerSummaries={providerSummaries}
        lateOrderProviders={lateOrderProviders}
        employees={(employees ?? []).map((employee) => ({
          id: employee.id,
          name: employee.full_name?.trim() || "Unnamed employee",
        }))}
        locations={(locations ?? []).map((location) => ({
          id: location.id,
          name: location.name,
          address: null,
          description: null,
        }))}
        primaryDeliveryDate={primaryDeliveryDate}
        jamaicaToday={today}
        providerCreationCycles={providerCreationCycles}
      />
    </div>
  );
}
