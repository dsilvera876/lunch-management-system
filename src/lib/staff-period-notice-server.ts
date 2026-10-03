import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffPeriodFinalizedNoticeSummary = {
  status:
    | "not_sent"
    | "sending"
    | "sent"
    | "partial_failure"
    | "failed"
    | "generated";
  globallyEnabled: boolean;
  eligibleRecipientCount: number;
  deliveryCount: number;
  pendingCount: number;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

export async function loadStaffPeriodFinalizedNoticeSummary(
  supabase: SupabaseClient,
  lunchPeriodId: string,
): Promise<StaffPeriodFinalizedNoticeSummary | null> {
  const { data, error } = await supabase.rpc("get_staff_lunch_period_finalized_notice_summary", {
    p_lunch_period_id: lunchPeriodId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = (data as Array<Record<string, string | number | boolean>> | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    status: String(row.status) as StaffPeriodFinalizedNoticeSummary["status"],
    globallyEnabled: row.globally_enabled === true,
    eligibleRecipientCount: Number(row.eligible_recipient_count ?? 0),
    deliveryCount: Number(row.delivery_count ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    queuedCount: Number(row.queued_count ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
  };
}
