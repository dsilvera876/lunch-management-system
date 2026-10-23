import { createClient } from "@/lib/supabase/server";
import {
  deriveStaffOrderCapabilities,
  groupOrdersIntoCheckouts,
  parseStaffMyOrdersSnapshot,
  type GroupedCheckout,
  type SelfServiceOrderingState,
  type StaffMyOrdersSnapshotRow,
  type StaffOrderCapabilities,
} from "@/lib/staff-my-orders";

function toOrderingState(
  value: StaffMyOrdersSnapshotRow["ordering_state"],
): SelfServiceOrderingState | null {
  return value ? {
    isOpen: value.is_open,
    isBusinessDay: value.is_business_day,
    periodFinalized: value.period_finalized,
  } : null;
}

export async function loadStaffGroupedCheckouts(): Promise<GroupedCheckout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_orders_snapshot");
  if (error) {
    throw new Error("Unable to load your orders.");
  }

  const snapshot = parseStaffMyOrdersSnapshot(data);
  const deliveredAtByOrderId = new Map<string, string>();
  const capabilitiesByOrderId = new Map<string, StaffOrderCapabilities>();
  const nowMs = Date.parse(snapshot.snapshotAt);

  for (const row of snapshot.rows) {
    if (row.delivered_at) {
      deliveredAtByOrderId.set(row.id, row.delivered_at);
    }
    capabilitiesByOrderId.set(
      row.id,
      deriveStaffOrderCapabilities({
        order: row,
        effectiveDeadline: row.effective_order_deadline,
        orderingState: toOrderingState(row.ordering_state),
        today: snapshot.jamaicaToday,
        nowMs,
      }),
    );
  }

  return groupOrdersIntoCheckouts(
    snapshot.rows,
    snapshot.dailySubsidyByOrderDate,
    deliveredAtByOrderId,
    capabilitiesByOrderId,
  );
}
