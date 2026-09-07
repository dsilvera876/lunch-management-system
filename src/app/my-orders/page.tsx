import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRelated, formatDeadline, formatCurrency } from "@/lib/format";
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
          name
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
        description="All of your lunch orders, listed individually."
        actions={
          <Link href="/lunch" className={linkButtonClass("primary")}>
            Place another order
          </Link>
        }
      />

      {!orders || orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When you place lunch orders, they will appear here."
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

            return (
              <Card key={order.id} padding="sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">
                        {provider?.name ?? "Lunch order"}
                      </h2>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-muted">
                      Delivery {lunchDay?.lunch_date ?? "—"}
                      {lunchDay?.order_date
                        ? ` · Ordered ${lunchDay.order_date}`
                        : ""}
                    </p>
                    <p className="text-sm text-muted">
                      Submitted {formatDeadline(order.created_at)}
                    </p>
                  </div>
                  <Link
                    href={`/lunch/orders/${order.id}`}
                    className={linkButtonClass("secondary")}
                  >
                    View order
                  </Link>
                </div>

                <ul className="mt-4 space-y-1 text-sm">
                  {order.order_items.map((item) => {
                    const menuItem = getRelated(item.menu_items);

                    return (
                      <li key={`${order.id}-${menuItem?.name ?? "item"}`}>
                        {menuItem?.name ?? "Menu item"} × {item.quantity}
                      </li>
                    );
                  })}
                </ul>

                {total > 0 && (
                  <p className="mt-3 text-sm font-medium">
                    Total: ${formatCurrency(total)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
