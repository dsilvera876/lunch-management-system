import { getJamaicaTodayDate } from "@/lib/datetime";
import { formatLunchPeriodAdminDate } from "@/lib/lunch-periods";

/**
 * A lunch period may be finalized only when its end date is strictly before
 * the current Jamaica calendar date (same rule as finalize_lunch_period).
 */
export function isLunchPeriodEligibleForFinalization(
  periodEndDate: string,
  jamaicaToday = getJamaicaTodayDate(),
): boolean {
  return periodEndDate < jamaicaToday;
}

export function lunchPeriodFinalizationEligibilityMessage(
  periodEndDate: string,
): string {
  return `This period can be finalized after ${formatLunchPeriodAdminDate(periodEndDate)}.`;
}
