"use server";

import { requireViewAllOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_RECENT_ORDER_HISTORY_LIMIT } from "@/lib/order-history";
import type { OperationalOrder } from "@/lib/operational-orders";
import {
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRows,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";

export type LoadEmployeeRecentOrdersResult =
  | { ok: true; orders: OperationalOrder[] }
  | { ok: false; error: string };

export async function loadEmployeeRecentOrderHistory(
  profileId: string,
): Promise<LoadEmployeeRecentOrdersResult> {
  const normalizedProfileId = profileId.trim();

  if (!normalizedProfileId) {
    return { ok: false, error: "Employee is required" };
  }

  try {
    await requireViewAllOrders();
  } catch {
    return { ok: false, error: "Order history access required" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .eq("profile_id", normalizedProfileId)
    .order("lunch_date", {
      referencedTable: "lunch_days",
      ascending: false,
    })
    .limit(EMPLOYEE_RECENT_ORDER_HISTORY_LIMIT);

  if (error) {
    return { ok: false, error: error.message };
  }

  let orders: OperationalOrder[];

  try {
    orders = await parseOperationalOrderRows(
      supabase,
      (data ?? []) as unknown as OperationalOrderRow[],
      "admin-employee-recent-orders",
    );
  } catch {
    return { ok: false, error: "Unable to load recent orders." };
  }

  return { ok: true, orders };
}
