export const JAMAICA_TIME_ZONE = "America/Jamaica";

/** ISO weekday: Monday = 1 through Friday = 5 */
export type Weekday = 1 | 2 | 3 | 4 | 5;

export const WEEKDAYS: ReadonlyArray<{
  value: Weekday;
  label: string;
  short: string;
}> = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
] as const;

export function getJamaicaTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TIME_ZONE,
  }).format(new Date());
}

/** Long-form Jamaica calendar date for shell chrome, e.g. "Monday, September 21, 2026". */
export function formatJamaicaHeaderDate(calendarDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${calendarDate}T12:00:00-05:00`));
}

export function getJamaicaIsoWeekday(dateStr: string): Weekday | null {
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TIME_ZONE,
    weekday: "long",
  }).format(new Date(`${dateStr}T12:00:00-05:00`));

  const weekdays: Record<string, Weekday> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
  };

  return weekdays[weekdayName] ?? null;
}

/** Next business weekday (order day -> delivery weekday). Fri -> Mon. */
export function getNextBusinessWeekday(weekday: Weekday): Weekday {
  if (weekday === 5) {
    return 1;
  }

  return (weekday + 1) as Weekday;
}

/** Calendar days to add for delivery after an order on the given weekday. */
export function getDaysUntilDelivery(orderWeekday: Weekday): number {
  return orderWeekday === 5 ? 3 : 1;
}

/**
 * Delivery calendar date for an order placed on orderDateStr (YYYY-MM-DD, Jamaica).
 * Mon order -> Tue delivery, Fri order -> Mon delivery.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00-05:00`);
  date.setUTCDate(date.getUTCDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TIME_ZONE,
  }).format(date);
}

/** Calendar days to subtract for inverse delivery → order date (matches PostgreSQL). */
export function getDaysBeforeDeliveryForOrderDate(deliveryWeekday: Weekday): number {
  return deliveryWeekday === 1 ? 3 : 1;
}

export function getDeliveryDateForOrderDate(orderDateStr: string): string | null {
  const orderWeekday = getJamaicaIsoWeekday(orderDateStr);

  if (!orderWeekday) {
    return null;
  }

  return addCalendarDays(orderDateStr, getDaysUntilDelivery(orderWeekday));
}

/** Mirrors `public.order_date_for_delivery_date`. */
export function getOrderDateForDeliveryDate(deliveryDateStr: string): string | null {
  const deliveryWeekday = getJamaicaIsoWeekday(deliveryDateStr);

  if (!deliveryWeekday) {
    return null;
  }

  return addCalendarDays(
    deliveryDateStr,
    -getDaysBeforeDeliveryForOrderDate(deliveryWeekday),
  );
}

export function formatWeekdayList(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b);
  const labels = new Map(WEEKDAYS.map((day) => [day.value, day.short]));

  return sorted
    .map((day) => labels.get(day as Weekday) ?? String(day))
    .join(" ");
}
