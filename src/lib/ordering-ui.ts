import {
  formatWeekdayList,
  JAMAICA_TIME_ZONE,
  WEEKDAYS,
  type Weekday,
} from "@/lib/datetime";
import type { StaffOrderingContext } from "@/lib/staff-ordering";

/** Long-form date for employee-facing copy, e.g. "Tuesday, September 8". */
export function formatDisplayDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateStr}T12:00:00-05:00`));
}

/** Headline for the ordering page, e.g. "Order today for delivery Tuesday, September 8". */
export function formatOrderDeliveryHeadline(deliveryDate: string): string {
  return `Order today for delivery ${formatDisplayDate(deliveryDate)}`;
}

export type OrderingClosedReason = {
  title: string;
  description: string;
};

export function getOrderingClosedReason(
  ctx: Pick<
    StaffOrderingContext,
    "orderWeekday" | "periodFinalized" | "orderingOpen"
  >,
): OrderingClosedReason | null {
  if (!ctx.orderWeekday) {
    return {
      title: "Ordering closed for the weekend",
      description:
        "Lunch ordering is closed on weekends. Ordering resumes Monday for Tuesday delivery.",
    };
  }

  if (ctx.periodFinalized) {
    return {
      title: "Ordering unavailable",
      description:
        "Ordering is unavailable because this lunch period has been finalized.",
    };
  }

  if (!ctx.orderingOpen) {
    return {
      title: "Ordering closed",
      description: "Today's ordering window has closed.",
    };
  }

  return null;
}

export function canEditOrder(
  status: string,
  orderingOpen: boolean,
): boolean {
  return status === "submitted" && orderingOpen;
}

export function summarizeProviderWeekdays(
  items: Array<{ active: boolean; weekdays: number[] }>,
): string {
  const activeItems = items.filter((item) => item.active);

  if (activeItems.length === 0) {
    return "No active items";
  }

  const weekdaySet = new Set<number>();

  for (const item of activeItems) {
    for (const weekday of item.weekdays) {
      weekdaySet.add(weekday);
    }
  }

  const weekdays = [...weekdaySet].sort((a, b) => a - b);

  if (weekdays.length === 0) {
    return "No weekdays configured";
  }

  return formatWeekdayList(weekdays);
}

export function parseOrderQuantity(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

export function isValidOrderQuantity(value: string | number): boolean {
  const quantity = parseOrderQuantity(value);
  return Number.isInteger(quantity) && quantity >= 1;
}

export function calculateLineSubtotal(
  price: number | string,
  quantity: number,
): number {
  return Number(price) * quantity;
}

export function formatWeekdayToggleLabel(weekday: Weekday): string {
  return WEEKDAYS.find((day) => day.value === weekday)?.short ?? String(weekday);
}
