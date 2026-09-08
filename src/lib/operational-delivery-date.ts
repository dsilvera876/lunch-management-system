import {
  getJamaicaIsoWeekday,
  getJamaicaTodayDate,
} from "@/lib/datetime";

/**
 * Default delivery date for HR operational views.
 * Mon–Fri use today (active delivery days). Weekends use the next Mon–Fri delivery day.
 */
export function getDefaultOperationalDeliveryDate(
  today = getJamaicaTodayDate(),
): string {
  if (getJamaicaIsoWeekday(today)) {
    return today;
  }

  const cursor = new Date(`${today}T12:00:00-05:00`);

  for (let step = 0; step < 7; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const candidate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Jamaica",
    }).format(cursor);

    if (getJamaicaIsoWeekday(candidate)) {
      return candidate;
    }
  }

  return today;
}
