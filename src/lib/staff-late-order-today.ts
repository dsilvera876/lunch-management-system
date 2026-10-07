import type {
  EligibleLateOrderCycle,
  StaffLateOrderRequestRow,
} from "@/app/home/staff-late-order-request-actions";

export type StaffLateOrderTodayContext = {
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
};

/** Authoritative pre-location summary (delivery dates only, no providers). */
export type StaffLateOrderNewRequestSummary = {
  available: boolean;
  eligibleDeliveryDates: string[];
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

/** Drawer delivery dates: scoped cycles when loaded; otherwise summary (pre-location) plus request history. */
export function collectStaffLateOrderDrawerDeliveryDates(
  context: StaffLateOrderTodayContext,
  options?: {
    newLateOrderOpportunity?: boolean;
    summary?: StaffLateOrderNewRequestSummary | null;
    /** When false, eligibility was already scoped to a saved default office on the server. */
    preLocationOnly?: boolean;
  },
): string[] {
  if (context.eligibleCycles.length > 0) {
    return collectStaffLateOrderDeliveryDates(context);
  }

  const dates = new Set<string>();
  for (const request of context.requests) {
    dates.add(request.scheduled_delivery_date);
  }

  const newLateOrderOpportunity = options?.newLateOrderOpportunity === true;
  const preLocationOnly = options?.preLocationOnly !== false;
  const summaryDates =
    preLocationOnly &&
    newLateOrderOpportunity &&
    options?.summary &&
    options.summary.eligibleDeliveryDates.length > 0
      ? options.summary.eligibleDeliveryDates
      : [];

  for (const date of summaryDates) {
    dates.add(date);
  }

  return [...dates].sort();
}

export function defaultStaffLateOrderDeliveryDate(
  deliveryDates: string[],
  jamaicaToday: string,
): string {
  if (deliveryDates.length === 0) {
    return "";
  }
  if (deliveryDates.includes(jamaicaToday)) {
    return jamaicaToday;
  }
  return deliveryDates[0]!;
}

export function staffLateOrderCreateAvailable(context: StaffLateOrderTodayContext): boolean {
  return context.eligibleCycles.length > 0;
}

/** True when the employee can start a new late-order request (loaded cycles or DB opportunity). */
export function staffLateOrderNewRequestAvailable(
  context: StaffLateOrderTodayContext,
  newLateOrderOpportunity: boolean,
): boolean {
  return staffLateOrderCreateAvailable(context) || newLateOrderOpportunity;
}

export function staffLateOrderDrawerVisible(
  context: StaffLateOrderTodayContext,
  options?: { newLateOrderOpportunity?: boolean },
): boolean {
  if (context.eligibleCycles.length > 0 || context.requests.length > 0) {
    return true;
  }

  return options?.newLateOrderOpportunity === true;
}

export function buildStaffLateOrderDrawerContext(
  fullContext: StaffLateOrderTodayContext,
  jamaicaToday: string,
  options?: {
    newLateOrderOpportunity?: boolean;
    summary?: StaffLateOrderNewRequestSummary | null;
    preLocationOnly?: boolean;
  },
): {
  visible: boolean;
  context: StaffLateOrderTodayContext;
  defaultDeliveryDate: string;
  deliveryDates: string[];
} {
  const deliveryDates = collectStaffLateOrderDrawerDeliveryDates(fullContext, options);
  return {
    visible: staffLateOrderDrawerVisible(fullContext, options),
    context: fullContext,
    defaultDeliveryDate: defaultStaffLateOrderDeliveryDate(deliveryDates, jamaicaToday),
    deliveryDates,
  };
}

export function reconcileStaffLateOrderDeliveryDate(
  deliveryDates: string[],
  jamaicaToday: string,
  currentDeliveryDate: string,
): string {
  if (deliveryDates.length === 0) {
    return currentDeliveryDate;
  }

  if (deliveryDates.includes(currentDeliveryDate)) {
    return currentDeliveryDate;
  }

  return defaultStaffLateOrderDeliveryDate(deliveryDates, jamaicaToday);
}

export function staffLateOrderDrawerTitle(
  selectedDeliveryDate: string,
  jamaicaToday: string,
): string {
  return selectedDeliveryDate === jamaicaToday ? "Late order for today" : "Late order request";
}

function collectCreateDeliveryDatesForActionLabel(
  context: StaffLateOrderTodayContext,
  summary: StaffLateOrderNewRequestSummary | null | undefined,
  newLateOrderOpportunity: boolean,
): string[] {
  if (newLateOrderOpportunity && summary && summary.eligibleDeliveryDates.length > 0) {
    return summary.eligibleDeliveryDates;
  }

  return collectStaffLateOrderDeliveryDates(context);
}

export function staffLateOrderCreateActionLabel(
  deliveryDates: string[],
  jamaicaToday: string,
): string {
  if (deliveryDates.includes(jamaicaToday)) {
    return "Submit late order for today";
  }

  return "Submit late order";
}

export function staffLateOrderActionLabel(
  context: StaffLateOrderTodayContext,
  jamaicaToday: string,
  options?: {
    newLateOrderOpportunity?: boolean;
    summary?: StaffLateOrderNewRequestSummary | null;
  },
): string | null {
  const newLateOrderOpportunity = options?.newLateOrderOpportunity === true;

  if (!staffLateOrderDrawerVisible(context, { newLateOrderOpportunity })) {
    return null;
  }

  const hasCreate = staffLateOrderNewRequestAvailable(context, newLateOrderOpportunity);

  if (hasCreate) {
    const deliveryDates = collectCreateDeliveryDatesForActionLabel(
      context,
      options?.summary,
      newLateOrderOpportunity,
    );
    return staffLateOrderCreateActionLabel(deliveryDates, jamaicaToday);
  }

  return "Late order status";
}

/** @deprecated Use staffLateOrderActionLabel */
export function staffLateOrderTriggerLabel(
  context: StaffLateOrderTodayContext,
  jamaicaToday: string,
  options?: {
    orderingOpen?: boolean;
    prominent?: boolean;
    newLateOrderOpportunity?: boolean;
    summary?: StaffLateOrderNewRequestSummary | null;
  },
): string | null {
  void options?.orderingOpen;
  void options?.prominent;
  return staffLateOrderActionLabel(context, jamaicaToday, {
    newLateOrderOpportunity: options?.newLateOrderOpportunity,
    summary: options?.summary,
  });
}
