import { candidateLateOrderDeliveryDates } from "@/lib/late-order-cycle";
import { getJamaicaTodayDate, getOrderDateForDeliveryDate } from "@/lib/datetime";
import {
  fetchCandidateLateOrderDeliveryDates,
  fetchOrderDateForDeliveryDate,
} from "@/lib/business-calendar-server";
import {
  isProviderLateOrderingOpen,
  type ProviderLateOrderSettings,
} from "@/lib/late-orders";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HrLateOrderCreationCycle = {
  deliveryDate: string;
  orderDate: string;
};

export function listHrLateOrderCreationCycles(input: {
  today: string;
  now: Date;
  deliveryDates?: string[];
  orderDateByDeliveryDate?: Record<string, string | null>;
  provider: Pick<
    ProviderLateOrderSettings,
    | "acceptsLateOrders"
    | "lateOrderDeadlineDay"
    | "lateOrderDeadlineTime"
  >;
  isCompanyCutoffPassed: (orderDate: string) => boolean;
}): HrLateOrderCreationCycle[] {
  if (!input.provider.acceptsLateOrders) {
    return [];
  }

  const cycles: HrLateOrderCreationCycle[] = [];
  const deliveryDates =
    input.deliveryDates ?? candidateLateOrderDeliveryDates(input.today);

  for (const deliveryDate of deliveryDates) {
    const orderDate =
      input.orderDateByDeliveryDate?.[deliveryDate] ??
      getOrderDateForDeliveryDate(deliveryDate);

    if (!orderDate) {
      continue;
    }

    const lateOpen = isProviderLateOrderingOpen(
      input.provider,
      orderDate,
      deliveryDate,
      input.now,
      input.isCompanyCutoffPassed(orderDate),
    );

    if (!lateOpen) {
      continue;
    }

    cycles.push({ deliveryDate, orderDate });
  }

  return cycles;
}

export function isDeliveryDateAllowedForHrLateOrderCreation(
  cycles: HrLateOrderCreationCycle[],
  deliveryDate: string,
): boolean {
  return cycles.some((cycle) => cycle.deliveryDate === deliveryDate);
}

export async function fetchHrLateOrderCreationCyclesForProvider(
  supabase: SupabaseClient,
  providerId: string,
  now: Date = new Date(),
): Promise<HrLateOrderCreationCycle[]> {
  const today = getJamaicaTodayDate();

  const { data: provider, error } = await supabase
    .from("lunch_providers")
    .select("accepts_late_orders, late_order_deadline_day, late_order_deadline_time")
    .eq("id", providerId)
    .maybeSingle();

  if (error || !provider) {
    return [];
  }

  const deliveryDates = await fetchCandidateLateOrderDeliveryDates(today);
  const orderDateByDeliveryDate: Record<string, string | null> = {};
  const cutoffByOrderDate: Record<string, boolean> = {};

  for (const deliveryDate of deliveryDates) {
    const orderDate = await fetchOrderDateForDeliveryDate(deliveryDate, null);
    orderDateByDeliveryDate[deliveryDate] = orderDate;

    if (!orderDate || orderDate in cutoffByOrderDate) {
      continue;
    }

    const { data: companyDeadlinePassed } = await supabase.rpc("order_deadline_for_order_date", {
      p_order_date: orderDate,
    });

    cutoffByOrderDate[orderDate] = companyDeadlinePassed
      ? now.getTime() > new Date(String(companyDeadlinePassed)).getTime()
      : false;
  }

  return listHrLateOrderCreationCycles({
    today,
    now,
    deliveryDates,
    orderDateByDeliveryDate,
    provider: {
      acceptsLateOrders: provider.accepts_late_orders,
      lateOrderDeadlineDay: provider.late_order_deadline_day,
      lateOrderDeadlineTime: provider.late_order_deadline_time,
    },
    isCompanyCutoffPassed: (orderDate) => cutoffByOrderDate[orderDate] ?? false,
  });
}
