import { createClient } from "@/lib/supabase/server";
import {
  getDeliveryDateForOrderDate,
  getJamaicaIsoWeekday,
  getJamaicaTodayDate,
  type Weekday,
} from "@/lib/datetime";
import type { MenuItemType } from "@/lib/menu-items";
import { DEFAULT_ORDER_CUTOFF_TIME } from "@/lib/settings";

export type AvailableMenuItem = {
  id: string;
  name: string;
  price: number;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory: string | null;
};

export type AvailableProvider = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  items: AvailableMenuItem[];
};

export type DeliveryOrderSummary = {
  id: string;
  status: string;
  created_at: string;
  lunch_day_id: string;
  providerName: string | null;
  orderDate: string | null;
  deliveryDate: string;
  items: Array<{
    name: string;
    quantity: number;
    itemType: MenuItemType;
    unitLabel: string;
  }>;
  specialInstructions: string | null;
  mealQuantity: number | null;
  total: number;
  office_location_name: string | null;
};

export type StaffOrderingContext = {
  orderDate: string;
  orderWeekday: Weekday | null;
  deliveryDate: string | null;
  cutoffTime: string;
  orderDeadline: string | null;
  periodFinalized: boolean;
  orderingOpen: boolean;
  availableProviders: AvailableProvider[];
  deliveryOrders: DeliveryOrderSummary[];
};

export async function getStaffOrderingContext(
  profileId: string,
): Promise<StaffOrderingContext> {
  const supabase = await createClient();
  const orderDate = getJamaicaTodayDate();
  const orderWeekday = getJamaicaIsoWeekday(orderDate);
  const deliveryDate = orderWeekday
    ? getDeliveryDateForOrderDate(orderDate)
    : null;

  const [{ data: settings }, { data: providers }, { data: orders }] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select("order_cutoff_time")
        .eq("id", 1)
        .single(),

      orderWeekday
        ? supabase
            .from("lunch_providers")
            .select(`
              id,
              name,
              description,
              provider_menu_items!inner (
                id,
                name,
                price,
                item_type,
                unit_label,
                display_category,
                active,
                provider_menu_item_weekdays!inner (
                  weekday
                )
              )
            `)
            .eq("active", true)
            .eq("provider_menu_items.active", true)
            .eq(
              "provider_menu_items.provider_menu_item_weekdays.weekday",
              orderWeekday,
            )
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] as never[], error: null }),

      deliveryDate
        ?       supabase
        .from("orders")
        .select(`
          id,
          status,
          created_at,
          lunch_day_id,
          special_instructions,
          meal_quantity,
          office_location_name,
          lunch_days!inner (
            lunch_date,
            order_date,
            lunch_providers (
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
            .eq("lunch_days.lunch_date", deliveryDate)
            .neq("status", "cancelled")
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as never[], error: null }),
    ]);

  const cutoffTime = settings?.order_cutoff_time ?? DEFAULT_ORDER_CUTOFF_TIME;

  const { data: orderDeadline } = orderWeekday
    ? await supabase.rpc("order_deadline_for_order_date", {
        p_order_date: orderDate,
      })
    : { data: null };

  const { data: periodFinalized } = orderWeekday
    ? await supabase.rpc("is_order_date_in_finalized_period", {
        p_order_date: orderDate,
      })
    : { data: false };

  const orderingOpen =
    orderWeekday !== null &&
    orderDeadline !== null &&
    !periodFinalized &&
    new Date() <= new Date(orderDeadline);

  const availableProviders =
    providers?.map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      itemCount: provider.provider_menu_items.length,
          items: provider.provider_menu_items.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            itemType: item.item_type as MenuItemType,
            unitLabel: item.unit_label,
            displayCategory: item.display_category,
          })),
    })) ?? [];

  const deliveryOrders: DeliveryOrderSummary[] =
    orders?.map((order) => {
      const lunchDay = Array.isArray(order.lunch_days)
        ? order.lunch_days[0]
        : order.lunch_days;
      const provider = lunchDay?.lunch_providers
        ? Array.isArray(lunchDay.lunch_providers)
          ? lunchDay.lunch_providers[0]
          : lunchDay.lunch_providers
        : null;

      const items = order.order_items.map((item) => {
        const menuItem = Array.isArray(item.menu_items)
          ? item.menu_items[0]
          : item.menu_items;

        return {
          name: menuItem?.name ?? "Menu item",
          quantity: item.quantity,
          itemType: (menuItem?.item_type ?? "standalone") as MenuItemType,
          unitLabel: menuItem?.unit_label ?? "Each",
        };
      });

      const total = order.order_items.reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0,
      );

      return {
        id: order.id,
        status: order.status,
        created_at: order.created_at,
        lunch_day_id: order.lunch_day_id,
        providerName: provider?.name ?? null,
        orderDate: lunchDay?.order_date ?? null,
        deliveryDate: lunchDay?.lunch_date ?? deliveryDate ?? "",
        items,
        specialInstructions: order.special_instructions ?? null,
        mealQuantity: order.meal_quantity ?? null,
        office_location_name: order.office_location_name ?? null,
        total,
      };
    }) ?? [];

  return {
    orderDate,
    orderWeekday,
    deliveryDate,
    cutoffTime,
    orderDeadline: orderDeadline ?? null,
    periodFinalized: Boolean(periodFinalized),
    orderingOpen,
    availableProviders,
    deliveryOrders,
  };
}
