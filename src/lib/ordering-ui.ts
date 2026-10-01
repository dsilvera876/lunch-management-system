import {
  formatWeekdayList,
  JAMAICA_TIME_ZONE,
  WEEKDAYS,
  type Weekday,
} from "@/lib/datetime";
import type { BusinessDayClosureInfo, StaffOrderingContext } from "@/lib/staff-ordering";

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
  /** Primary staff-facing message (status bar). */
  description: string;
  /** Shorter empty-state body to avoid repeating the status bar sentence. */
  emptyStateDescription: string;
};

export function formatStaffBusinessDayClosedMessage(
  closure: Pick<BusinessDayClosureInfo, "entryType" | "name"> | null | undefined,
): string {
  const name = closure?.name?.trim();
  if (!name) {
    return "Lunch ordering is closed today.";
  }

  if (closure?.entryType === "public_holiday") {
    return `Lunch ordering is closed today for ${name}.`;
  }

  return `Lunch ordering is closed today due to ${name}.`;
}

export function getOrderingClosedReason(
  ctx: Pick<
    StaffOrderingContext,
    | "orderWeekday"
    | "businessDayOpen"
    | "businessDayClosure"
    | "periodFinalized"
    | "orderingOpen"
  >,
): OrderingClosedReason | null {
  if (!ctx.businessDayOpen) {
    const description = formatStaffBusinessDayClosedMessage(ctx.businessDayClosure);
    return {
      title: "Ordering closed today",
      description,
      emptyStateDescription: "Lunch ordering is unavailable today.",
    };
  }

  if (!ctx.orderWeekday) {
    const description = formatStaffBusinessDayClosedMessage(ctx.businessDayClosure);
    return {
      title: "Ordering closed today",
      description,
      emptyStateDescription: "Lunch ordering is unavailable today.",
    };
  }

  if (ctx.periodFinalized) {
    const description =
      "Ordering is unavailable because this lunch period has been finalized.";
    return {
      title: "Ordering unavailable",
      description,
      emptyStateDescription: description,
    };
  }

  if (!ctx.orderingOpen) {
    const description = "Today's ordering window has closed.";
    return {
      title: "Ordering closed",
      description,
      emptyStateDescription: description,
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
