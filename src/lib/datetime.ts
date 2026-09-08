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
export function getDeliveryDateForOrderDate(orderDateStr: string): string | null {
  const orderWeekday = getJamaicaIsoWeekday(orderDateStr);

  if (!orderWeekday) {
    return null;
  }

  const deliveryDate = new Date(`${orderDateStr}T12:00:00-05:00`);
  deliveryDate.setUTCDate(
    deliveryDate.getUTCDate() + getDaysUntilDelivery(orderWeekday),
  );

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TIME_ZONE,
  }).format(deliveryDate);
}

export function formatWeekdayList(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b);
  const labels = new Map(WEEKDAYS.map((day) => [day.value, day.short]));

  return sorted
    .map((day) => labels.get(day as Weekday) ?? String(day))
    .join(" ");
}
