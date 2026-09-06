export const DEFAULT_ORDER_CUTOFF_TIME = "16:00:00";

const CUTOFF_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Formats a Jamaica-local wall-clock time from the database (time-only).
 * Does not apply timezone conversion.
 */
export function formatJamaicaWallClockTime(value: string): string {
  const match = CUTOFF_TIME_PATTERN.exec(value.trim());

  if (!match) {
    return value;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");

  return `${displayHours}:${displayMinutes} ${period}`;
}

/** Normalizes HH:mm or HH:mm:ss into HH:mm for `<input type="time">`. */
export function cutoffTimeToFormValue(value: string): string {
  const match = CUTOFF_TIME_PATTERN.exec(value.trim());

  if (!match) {
    return value.slice(0, 5);
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];

  return `${hours}:${minutes}`;
}
