import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRelated, formatCurrency, formatHumanDate } from "@/lib/format";
import { formatOrderLineLabel, groupMenuItemsByType, groupStandaloneItemsByCategory, type MenuItemType } from "@/lib/menu-items";
import {
  getStaffDeliveryStatusLabel,
  type DeliveryState,
  type FinancialDisposition,
} from "@/lib/delivery-reconciliation";
import { formatMealBundleLabel } from "@/lib/order-payload";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { linkButtonClass } from "@/components/ui/button";

export default async function MyOrdersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      delivery_state,
      financial_disposition,
      special_instructions,
      meal_quantity,
      office_location_name,
      lunch_days (
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
          unit_label,
          display_category
        )
      )
    `)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error("Unable to load your orders.");
  }

  return (
    <>
      <PageHeader
        title="My Orders"
        description="Each order is listed separately, even when placed on the same day."
        actions={
          <Link href="/lunch" className={linkButtonClass("primary")}>
            Place another order
          </Link>
        }
      />

      {!orders || orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When you place lunch orders, each one will appear here individually."
          action={
            <Link href="/lunch" className={linkButtonClass("primary")}>
              View Today&apos;s Lunch
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const lunchDay = getRelated(order.lunch_days);
            const provider = lunchDay
              ? getRelated(lunchDay.lunch_providers)
              : null;
            const total = order.order_items.reduce(
              (sum, item) => sum + Number(item.unit_price) * item.quantity,
              0,
            );
            const isCancelled = order.status === "cancelled";
            const staffDeliveryLabel = getStaffDeliveryStatusLabel({
              status: order.status,
              deliveryState: order.delivery_state as DeliveryState,
              financialDisposition: order.financial_disposition as FinancialDisposition,
            });

            const grouped = groupMenuItemsByType(
              order.order_items.map((item) => {
                const menuItem = getRelated(item.menu_items);
                return {
                  name: menuItem?.name ?? "Menu item",
                  quantity: item.quantity,
                  itemType: (menuItem?.item_type ?? "standalone") as MenuItemType,
                  unitLabel: menuItem?.unit_label ?? "Each",
                  unitPrice: item.unit_price,
                  displayCategory: menuItem?.display_category,
                };
              }),
            );

            const standaloneGrouped = groupStandaloneItemsByCategory(grouped.standalone);

            return (
              <Card
                key={order.id}
                padding="sm"
                className={
                  isCancelled ? "opacity-75 ring-1 ring-slate-200" : undefined
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-foreground">
                          {provider?.name ?? "Lunch order"}
                        </h2>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        Delivery: {lunchDay?.lunch_date ? formatHumanDate(lunchDay.lunch_date) : "Unknown date"}
                        {order.office_location_name ? ` · ${order.office_location_name}` : ""}
                      </p>
                      {staffDeliveryLabel && (
                        <p className="mt-1 text-sm font-medium text-rose-800">
                          {staffDeliveryLabel}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2 mt-1 sm:mt-0">
                      <Link
                        href={`/lunch/orders/${order.id}`}
                        className={linkButtonClass("secondary")}
                      >
                        View
                      </Link>
                    </div>
                  </div>

                  {!isCancelled && (
                    <div className="space-y-4 border-t border-border pt-4 text-sm">
                      {order.meal_quantity && grouped.main.length > 0 && (
                        <div>
                          <p className="font-semibold">{formatMealBundleLabel(order.meal_quantity)}</p>
                          <ul className="mt-1 space-y-1 text-muted">
                            {[...grouped.main, ...grouped.side].map((item) => (
                              <li key={item.name}>{item.name}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {Object.entries(standaloneGrouped).map(([category, items]) => (
                        <div key={category}>
                          <p className="font-semibold">{category}</p>
                          <ul className="mt-1 space-y-1 text-muted">
                            {items.map((item) => (
                              <li key={item.name} className="flex justify-between gap-4">
                                <span>
                                  {formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}
                                </span>
                                <span className="shrink-0">{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {order.special_instructions && (
                        <div>
                          <p className="font-semibold">Special instructions</p>
                          <p className="mt-1 text-muted">{order.special_instructions}</p>
                        </div>
                      )}

                      {total > 0 && (
                        <div className="flex justify-between gap-4 border-t border-border pt-3 font-semibold">
                          <span>Total</span>
                          <span>{formatCurrency(total)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
