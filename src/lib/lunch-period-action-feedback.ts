export type LunchPeriodActionErrorCode =
  | "invalid"
  | "invalid-range"
  | "create"
  | "update"
  | "update-end"
  | "set-current"
  | "unexpected";

export type LunchPeriodActionResult =
  | { success: true }
  | { success: false; error: LunchPeriodActionErrorCode };

export const LUNCH_PERIOD_SUCCESS_TOAST_DURATION_MS = 4_500;

export const LUNCH_PERIOD_CREATED_SUCCESS = "Lunch period created successfully.";
export const LUNCH_PERIOD_UPDATED_SUCCESS = "Lunch period updated successfully.";
export const LUNCH_PERIOD_CURRENT_SUCCESS = "Current lunch period updated successfully.";

export function lunchPeriodActionErrorMessage(
  error: LunchPeriodActionErrorCode,
): string {
  if (error === "invalid-range") {
    return "Enter a valid label and date range. Periods must remain contiguous with no gaps or overlaps.";
  }

  return "Unable to complete that lunch period action.";
}
