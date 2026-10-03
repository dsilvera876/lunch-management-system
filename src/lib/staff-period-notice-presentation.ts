import type { StaffPeriodFinalizedNoticeSummary } from "@/lib/staff-period-notice-server";

export function staffPeriodNoticeStatusLabel(
  summary: Pick<StaffPeriodFinalizedNoticeSummary, "status">,
): string {
  switch (summary.status) {
    case "not_sent":
      return "Staff notice not sent";
    case "sending":
      return "Sending staff notice";
    case "sent":
      return "Staff notice sent";
    case "partial_failure":
      return "Staff notice partially delivered";
    case "failed":
      return "Staff notice delivery failed";
    case "generated":
      return "Staff notice queued";
    default:
      return "Staff notice";
  }
}

export function canSendStaffPeriodFinalizedNotice(
  summary: StaffPeriodFinalizedNoticeSummary,
  options: { supportReadOnly: boolean; canMutate: boolean },
): boolean {
  if (!options.canMutate || options.supportReadOnly) {
    return false;
  }

  if (!summary.globallyEnabled) {
    return false;
  }

  return (
    summary.status === "not_sent" ||
    summary.status === "failed" ||
    summary.status === "partial_failure"
  );
}

export function staffPeriodNoticeDisabledMessage(
  summary: Pick<StaffPeriodFinalizedNoticeSummary, "globallyEnabled">,
): string {
  if (!summary.globallyEnabled) {
    return "Staff period-finalized notices are disabled in Email Settings. Finalization is unaffected.";
  }

  return "";
}
