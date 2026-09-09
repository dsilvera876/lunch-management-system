"use server";

import { requireViewAllOrders } from "@/lib/auth";
import { assertDeliveriesPayloadSafe } from "@/lib/deliveries";
import type { OperationalOrder } from "@/lib/operational-orders";
import {
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
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
    return { success: false, error: "Unable to load deliveries." };
  }

  const orders = (data ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  assertDeliveriesPayloadSafe({ orders });

  return { success: true, orders };
}
