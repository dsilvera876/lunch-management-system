"use server";

import { requireViewAllOrders } from "@/lib/auth";
import { assertDeliveriesPayloadSafe } from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import {
  logOperationalOrdersQueryError,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRows,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import { createClient } from "@/lib/supabase/server";

export type LoadDeliveriesResult =
  | { success: true; orders: OperationalOrder[] }
  | { success: false; error: string };

export async function loadDeliveriesForDateAction(
  deliveryDate: string,
): Promise<LoadDeliveriesResult> {
  const trimmedDate = deliveryDate.trim();

  if (!trimmedDate) {
    return { success: false, error: "Delivery date is required." };
  }

  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "Deliveries access required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("lunch_days.lunch_date", trimmedDate)
    .order("created_at", { ascending: true });

  if (error) {
    logOperationalOrdersQueryError("admin/deliveries/load-data", error);
    return { success: false, error: "Unable to load deliveries." };
  }

  let orders: OperationalOrder[];

  try {
    orders = await parseOperationalOrderRows(
      supabase,
      (data ?? []) as unknown as OperationalOrderRow[],
      "admin-deliveries-action",
    );
  } catch {
    return { success: false, error: "Unable to load deliveries." };
  }

  assertDeliveriesPayloadSafe({ orders });

  return { success: true, orders };
}
