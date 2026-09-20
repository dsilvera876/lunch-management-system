import { createClient } from "@/lib/supabase/server";
import {
  groupOrdersIntoCheckouts,
  type GroupedCheckout,
  type StaffMyOrdersRawRow,
} from "@/lib/staff-my-orders";

export async function loadStaffGroupedCheckouts(profileId: string): Promise<GroupedCheckout[]> {
  const supabase = await createClient();

  const [{ data: orders, error }, { data: dailySubsidyRaw }] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        order_group_id,
        status,
        created_at,
        updated_at,
        delivery_state,
        financial_disposition,
        special_instructions,
        meal_quantity,
        office_location_name,
        lunch_days (
          lunch_date,
          order_date,
          order_deadline,
          lunch_providers (
            id,
            name
          )
        ),
        order_items (
          quantity,
          unit_price,
          menu_items (
            name,
            item_type,
            unit_label
          )
        )
      `)
      .eq("profile_id", profileId)
      .not("order_group_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.rpc("get_daily_lunch_subsidy"),
  ]);

  if (error) {
    throw new Error("Unable to load your orders.");
  }

  const rows = (orders ?? []) as StaffMyOrdersRawRow[];
  const orderIds = rows.map((row) => row.id);

  const deliveredAtByOrderId = new Map<string, string>();

  if (orderIds.length > 0) {
    const { data: events } = await supabase
      .from("order_delivery_events")
      .select("order_id, created_at, event_type")
      .in("order_id", orderIds)
      .eq("event_type", "marked_delivered")
      .order("created_at", { ascending: false });

    for (const event of events ?? []) {
      if (!deliveredAtByOrderId.has(event.order_id)) {
        deliveredAtByOrderId.set(event.order_id, event.created_at);
      }
    }
  }

  const dailySubsidy = Number(dailySubsidyRaw ?? 0);

  return groupOrdersIntoCheckouts(rows, dailySubsidy, deliveredAtByOrderId);
}
