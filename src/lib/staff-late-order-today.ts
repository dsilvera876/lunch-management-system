import type {
  EligibleLateOrderCycle,
  StaffLateOrderRequestRow,
} from "@/app/home/staff-late-order-request-actions";

export type StaffLateOrderTodayContext = {
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
};

export function filterStaffLateOrderForDeliveryDate(
  context: StaffLateOrderTodayContext,
  deliveryDate: string,
): StaffLateOrderTodayContext {
  return {
    eligibleCycles: context.eligibleCycles.filter(
      (cycle) => cycle.scheduled_delivery_date === deliveryDate,
    ),
    requests: context.requests.filter((request) => request.scheduled_delivery_date === deliveryDate),
  };
}

/** @deprecated Prefer full RPC context; use filterStaffLateOrderForDeliveryDate when scoping to one date. */
export function filterStaffLateOrderForJamaicaToday(
  context: StaffLateOrderTodayContext,
  jamaicaToday: string,
): StaffLateOrderTodayContext {
  return filterStaffLateOrderForDeliveryDate(context, jamaicaToday);
}

export function collectStaffLateOrderDeliveryDates(context: StaffLateOrderTodayContext): string[] {
  const dates = new Set<string>();
  for (const cycle of context.eligibleCycles) {
    dates.add(cycle.scheduled_delivery_date);
  }
  for (const request of context.requests) {
    dates.add(request.scheduled_delivery_date);
  }
  return [...dates].sort();
}

export function defaultStaffLateOrderDeliveryDate(
  deliveryDates: string[],
  jamaicaToday: string,
): string {
  if (deliveryDates.length === 0) {
    return jamaicaToday;
  }
  if (deliveryDates.includes(jamaicaToday)) {
    return jamaicaToday;
  }
  return deliveryDates[0]!;
}

export function staffLateOrderDrawerVisible(context: StaffLateOrderTodayContext): boolean {
  return context.eligibleCycles.length > 0 || context.requests.length > 0;
}

export function staffLateOrderCreateAvailable(context: StaffLateOrderTodayContext): boolean {
  return context.eligibleCycles.length > 0;
}

export function buildStaffLateOrderDrawerContext(
  fullContext: StaffLateOrderTodayContext,
  jamaicaToday: string,
): {
  visible: boolean;
  context: StaffLateOrderTodayContext;
  defaultDeliveryDate: string;
  deliveryDates: string[];
} {
  const deliveryDates = collectStaffLateOrderDeliveryDates(fullContext);
  return {
    visible: staffLateOrderDrawerVisible(fullContext),
    context: fullContext,
    defaultDeliveryDate: defaultStaffLateOrderDeliveryDate(deliveryDates, jamaicaToday),
    deliveryDates,
  };
}

export function staffLateOrderDrawerTitle(
  selectedDeliveryDate: string,
  jamaicaToday: string,
): string {
  return selectedDeliveryDate === jamaicaToday ? "Late order for today" : "Late order request";
}

export function staffLateOrderTriggerLabel(
  context: StaffLateOrderTodayContext,
  jamaicaToday: string,
  options?: { orderingOpen?: boolean; prominent?: boolean },
): string | null {
  if (!staffLateOrderDrawerVisible(context)) {
    return null;
  }

  const deliveryDates = collectStaffLateOrderDeliveryDates(context);
  const hasCreate = staffLateOrderCreateAvailable(context);

  if (hasCreate) {
    if (options?.prominent && options?.orderingOpen === false) {
      return "Request a late order";
    }

    if (deliveryDates.length > 1) {
      return "Late orders";
    }

    if (deliveryDates.length === 1) {
      const onlyDate = deliveryDates[0]!;
      return onlyDate === jamaicaToday ? "Late order for today" : "Late order";
    }
  }

  return "Late order status";
}
