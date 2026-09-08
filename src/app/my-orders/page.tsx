import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRelated, formatDeadline, formatCurrency } from "@/lib/format";
import { formatDisplayDate } from "@/lib/ordering-ui";
import { formatOrderLineLabel } from "@/lib/menu-items";
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
      created_at,
      special_instructions,
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
          unit_label
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
              Order lunch
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

            return (
              <Card
                key={order.id}
                padding="sm"
                className={
                  isCancelled ? "opacity-75 ring-1 ring-slate-200" : undefined
                }
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">
                        {provider?.name ?? "Lunch order"}
                      </h2>
                      <StatusBadge status={order.status} />
                    </div>

                    <dl className="grid gap-1 text-sm text-muted">
                      {lunchDay?.order_date && (
                        <div>
                          <dt className="sr-only">Order date</dt>
                          <dd>
                            Ordered {formatDisplayDate(lunchDay.order_date)}
                          </dd>
                        </div>
                      )}
                      {lunchDay?.lunch_date && (
                        <div>
                          <dt className="sr-only">Delivery date</dt>
                          <dd>
                            Delivery {formatDisplayDate(lunchDay.lunch_date)}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="sr-only">Submitted</dt>
                        <dd>Submitted {formatDeadline(order.created_at)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                    {!isCancelled && total > 0 && (
                      <p className="text-sm font-semibold">
                        Total: {formatCurrency(total)}
                      </p>
                    )}
                    <Link
                      href={`/lunch/orders/${order.id}`}
                      className={linkButtonClass("secondary")}
                    >
                      View order
                    </Link>
                  </div>
                </div>

                {!isCancelled && order.special_instructions && (
                  <p className="mt-3 text-sm text-muted">
                    <span className="font-medium text-foreground">Instructions:</span>{" "}
                    {order.special_instructions}
                  </p>
                )}

                {!isCancelled && (
                  <ul className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
                    {order.order_items.map((item) => {
                      const menuItem = getRelated(item.menu_items);

                      return (
                        <li
                          key={`${order.id}-${menuItem?.name ?? "item"}`}
                          className="flex justify-between gap-3"
                        >
                          <span>
                            {formatOrderLineLabel(
                              menuItem?.name ?? "Menu item",
                              menuItem?.unit_label ?? "Each",
                              item.quantity,
                            )}
                          </span>
                          <span className="shrink-0 text-muted">
                            {formatCurrency(Number(item.unit_price) * item.quantity)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
