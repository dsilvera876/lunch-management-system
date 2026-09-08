import { JAMAICA_TIME_ZONE } from "./datetime";

export type Related<T> = T | T[] | null;

export function getRelated<T>(value: Related<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatCurrency(value: number | string) {
  const numeric = Number(value);
  if (isNaN(numeric)) {
    return "$0.00";
  }
  return "$" + numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPrice(value: number | string) {
  const numeric = Number(value);
  if (isNaN(numeric) || numeric === 0) {
    return "";
  }
  return formatCurrency(numeric);
}

export function formatHumanDate(dateString: string) {
  // A PostgreSQL date is a Jamaica calendar date, not an instant. Explicit
  // Jamaica noon keeps formatting independent of the server's local timezone.
  const date = new Date(`${dateString}T12:00:00-05:00`);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}
