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

/** Staff /lunch drawer scope: Jamaica calendar today only (ignores future RPC cycles). */
export function filterStaffLateOrderForJamaicaToday(
  context: StaffLateOrderTodayContext,
  jamaicaToday: string,
): StaffLateOrderTodayContext {
  return filterStaffLateOrderForDeliveryDate(context, jamaicaToday);
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
): { visible: boolean; context: StaffLateOrderTodayContext; deliveryDate: string } {
  const context = filterStaffLateOrderForJamaicaToday(fullContext, jamaicaToday);
  return {
    visible: staffLateOrderDrawerVisible(context),
    context,
    deliveryDate: jamaicaToday,
  };
}

export const LATE_ORDER_DRAWER_TITLE = "Late order for today" as const;

export function staffLateOrderTriggerLabel(
  context: StaffLateOrderTodayContext,
  options?: { orderingOpen?: boolean; prominent?: boolean },
): string | null {
  if (!staffLateOrderDrawerVisible(context)) {
    return null;
  }

  if (staffLateOrderCreateAvailable(context)) {
    if (options?.prominent && options?.orderingOpen === false) {
      return "Request a late order";
    }

    return "Late order for today";
  }

  return "Late order status";
}
