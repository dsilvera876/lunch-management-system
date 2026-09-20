export type CalendarDayCell = {
  date: string;
  day: number;
  inCurrentMonth: boolean;
};

export type CalendarMonthParts = {
  year: number;
  month: number;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatPastOrderDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parsePastOrderDate(value: string): CalendarMonthParts & { day: number } | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

export function addCalendarMonths(
  year: number,
  month: number,
  delta: number,
): CalendarMonthParts {
  const anchor = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildCalendarMonthGrid(year: number, month: number): CalendarDayCell[] {
  const leadingEmpty = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const currentMonthDays = daysInMonth(year, month);
  const cells: CalendarDayCell[] = [];

  const previousMonth = addCalendarMonths(year, month, -1);
  const previousMonthDays = daysInMonth(previousMonth.year, previousMonth.month);

  for (let index = 0; index < leadingEmpty; index += 1) {
    const day = previousMonthDays - leadingEmpty + index + 1;
    cells.push({
      date: formatPastOrderDate(previousMonth.year, previousMonth.month, day),
      day,
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= currentMonthDays; day += 1) {
    cells.push({
      date: formatPastOrderDate(year, month, day),
      day,
      inCurrentMonth: true,
    });
  }

  const nextMonth = addCalendarMonths(year, month, 1);
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({
      date: formatPastOrderDate(nextMonth.year, nextMonth.month, nextDay),
      day: nextDay,
      inCurrentMonth: false,
    });
    nextDay += 1;
  }

  while (cells.length < 42) {
    cells.push({
      date: formatPastOrderDate(nextMonth.year, nextMonth.month, nextDay),
      day: nextDay,
      inCurrentMonth: false,
    });
    nextDay += 1;
  }

  return cells;
}

export function formatCalendarMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export const CALENDAR_WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export const PAST_ORDER_DATE_PICKER_MOBILE_MEDIA_QUERY = "(max-width: 639px)";
