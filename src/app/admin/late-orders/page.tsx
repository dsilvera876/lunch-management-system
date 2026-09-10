import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getJamaicaTodayDate, getDeliveryDateForOrderDate } from "@/lib/datetime";
import { getRelated } from "@/lib/format";
import {
  formatAutomaticSupplementScheduleLabel,
  formatLateOrderTimeLabel,
  formatSupplementDispatchStatusLabel,
  isAutomaticSupplementDue,
  isProviderLateOrderingOpen,
  type SupplementDispatchRecord,
} from "@/lib/late-orders";
import { LateOrdersWorkspace } from "@/components/admin/late-orders-workspace";
import { PageHeader } from "@/components/ui/page-header";

export default async function LateOrdersPage() {
  await requireViewAllOrders();
  const supabase = await createClient();
  const today = getJamaicaTodayDate();
  const now = new Date();
  const upcomingDeliveryDates = [
    getDeliveryDateForOrderDate(today),
    today,
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

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
    for (const deliveryDate of upcomingDeliveryDates) {
      const { data: orderDateValue } = await supabase.rpc("order_date_for_delivery_date", {
        p_delivery_date: deliveryDate,
      });

      if (!orderDateValue) {
        continue;
      }

      const orderDate = String(orderDateValue);
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
        .select("id")
        .eq("provider_id", provider.id)
        .eq("order_date", orderDate)
        .eq("lunch_date", deliveryDate)
        .maybeSingle();

      const { data: dispatchedRows } = await supabase
        .from("provider_late_order_dispatch_orders")
        .select("order_id, provider_late_order_dispatches!inner(provider_id, scheduled_delivery_date, status, sent_at)")
        .eq("provider_late_order_dispatches.provider_id", provider.id)
        .eq("provider_late_order_dispatches.scheduled_delivery_date", deliveryDate)
        .eq("provider_late_order_dispatches.status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1);

      const dispatchedOrderIds = new Set(
        (dispatchedRows ?? []).map((row) => row.order_id as string),
      );

      const { data: lateOrders } = await supabase
        .from("orders")
        .select(
          `
          id,
          created_at,
          profiles ( full_name ),
          lunch_days!inner ( lunch_date, order_date, provider_id )
        `,
        )
        .eq("is_late_order", true)
        .eq("lunch_days.provider_id", provider.id)
        .eq("lunch_days.lunch_date", deliveryDate)
        .order("created_at", { ascending: false });

      const approvedUnsent = (lateOrders ?? []).filter(
        (order) => !dispatchedOrderIds.has(order.id as string),
      ).length;

      const [{ data: dispatchRows }, { data: opportunityRow }] = await Promise.all([
        supabase
          .from("provider_late_order_dispatches")
          .select("id, status, dispatch_type, sent_at, error_summary, created_at")
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
        snapshotMissing: !snapshotRow,
        latestDispatch,
        automaticOpportunity,
        now,
      });

      const attentionDispatchId =
        dispatchRows?.find((row) => row.status === "attention_required")?.id ?? null;

      providerSummaries.push({
        providerId: provider.id,
        providerName: provider.name,
        deliveryDate,
        orderDate,
        acceptsLateOrders: provider.accepts_late_orders,
        deadlineLabel: provider.late_order_deadline_day
          ? `${provider.late_order_deadline_day === "delivery_day" ? "Delivery Day" : "Order Day"} at ${formatLateOrderTimeLabel(provider.late_order_deadline_time)}`
          : "Not configured",
        lateOrderingOpen: lateOpen,
        approvedUnsentCount: approvedUnsent,
        dispatchMode: provider.supplemental_dispatch_mode,
        automaticScheduleLabel: formatAutomaticSupplementScheduleLabel({
          supplementalDispatchMode: provider.supplemental_dispatch_mode,
          automaticSupplementSendDay: provider.automatic_supplement_send_day,
          automaticSupplementSendTime: provider.automatic_supplement_send_time,
        }),
        supplementStatusLabel,
        snapshotMissing: !snapshotRow,
        hasBlockingDispatch,
        attentionDispatchId,
        primaryOrderEmail: provider.primary_order_email,
        lateOrders: (lateOrders ?? []).map((order) => {
          const profile = getRelated(
            order.profiles as { full_name: string | null } | { full_name: string | null }[] | null,
          );

          return {
            id: order.id as string,
            employeeName: profile?.full_name?.trim() || "Employee",
            createdAt: order.created_at as string,
            dispatched: dispatchedOrderIds.has(order.id as string),
          };
        }),
      });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Late Orders"
        description="Create and manage HR late-order exceptions after the normal company cutoff."
      />
      <LateOrdersWorkspace
        providerSummaries={providerSummaries.filter(
          (summary) => summary.acceptsLateOrders || summary.lateOrders.length > 0,
        )}
        employees={(employees ?? []).map((employee) => ({
          id: employee.id,
          name: employee.full_name?.trim() || "Unnamed employee",
        }))}
        locations={locations ?? []}
        defaultDeliveryDate={upcomingDeliveryDates[0] ?? today}
      />
    </div>
  );
}
