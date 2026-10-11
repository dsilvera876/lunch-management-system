export const LATE_ORDER_AVAILABILITY_CHECKING_MESSAGE = "Checking late-order availability…";

export const LATE_ORDER_SUBMITTING_MESSAGE = "Submitting late order request…";

/** Spoken after the delivery location changes and eligibility reloads. */
export function formatLateOrderAvailabilityAnnouncement(optionCount: number): string {
  if (optionCount <= 0) {
    return "No late-order providers are available for this location.";
  }

  if (optionCount === 1) {
    return "1 late-order option is available.";
  }

  return `${optionCount} late-order options are available.`;
}
