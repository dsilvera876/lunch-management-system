import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{
    lunchDay?: string;
    status?: string;
  }>;
};

type Related<T> = T | T[] | null;

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  profiles: Related<{
    full_name: string | null;
  }>;
  lunch_days: Related<{
    lunch_date: string;
  }>;
  order_items: Array<{
    id: string;
    quantity: number;
    unit_price: number | string;
    menu_items: Related<{
      name: string;
    }>;
  }>;
};

function getRelated<T>(value: Related<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminOrdersPage({
  searchParams,
}: Props) {
  await requireAdmin();

  const params = await searchParams;
  const supabase = await createClient();

  const { data: lunchDays, error: lunchDaysError } = await supabase
    .from("lunch_days")
    .select("id, lunch_date")
    .order("lunch_date", { ascending: false });

  if (lunchDaysError) {
    throw new Error("Unable to load lunch days.");
  }

  let ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      status,
      created_at,
      profiles (
        full_name
      ),
      lunch_days (
        lunch_date
      ),
      order_items (
        id,
        quantity,
        unit_price,
        menu_items (
          name
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (params.lunchDay) {
    ordersQuery = ordersQuery.eq("lunch_day_id", params.lunchDay);
  }

  if (
    params.status &&
    ["submitted", "cancelled", "fulfilled"].includes(params.status)
  ) {
    ordersQuery = ordersQuery.eq("status", params.status);
  }

  const { data, error } = await ordersQuery;

  if (error) {
    throw new Error("Unable to load orders.");
  }

  const orders = (data ?? []) as OrderRow[];

  const itemTotals = new Map<
    string,
    {
      name: string;
      quantity: number;
    }
  >();

  let activeOrderValue = 0;

  for (const order of orders) {
    if (order.status === "cancelled") {
      continue;
    }

    for (const item of order.order_items) {
      const menuItem = getRelated(item.menu_items);
      const name = menuItem?.name ?? "Menu item";

      const existing = itemTotals.get(name);

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        itemTotals.set(name, {
          name,
          quantity: item.quantity,
        });
      }

      activeOrderValue +=
        Number(item.unit_price) * item.quantity;
    }
  }

  const summaryItems = Array.from(itemTotals.values()).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Orders</h1>

        <Link href="/admin" className="underline">
          Admin dashboard
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Filters</h2>

        <form
          method="get"
          className="mt-4 flex flex-wrap items-end gap-4"
        >
          <div>
            <label htmlFor="lunchDay" className="block">
              Lunch day
            </label>

            <select
              id="lunchDay"
              name="lunchDay"
              defaultValue={params.lunchDay ?? ""}
              className="rounded border p-2"
            >
              <option value="">All lunch days</option>

              {lunchDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.lunch_date}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="status" className="block">
              Status
            </label>

            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded border p-2"
            >
              <option value="">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded border px-4 py-2"
          >
            Apply filters
          </button>

          <Link href="/admin/orders" className="px-2 py-2 underline">
            Clear
          </Link>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Menu item totals</h2>

        <p className="mt-1 text-sm">
          Cancelled orders are excluded from these totals.
        </p>

        {summaryItems.length === 0 ? (
          <p className="mt-4">No active ordered items.</p>
        ) : (
          <div className="mt-4 max-w-xl overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Menu item</th>
                  <th className="p-2">Quantity</th>
                </tr>
              </thead>

              <tbody>
                {summaryItems.map((item) => (
                  <tr key={item.name} className="border-b">
                    <td className="p-2">{item.name}</td>
                    <td className="p-2">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 font-semibold">
          Active order value: ${activeOrderValue.toFixed(2)}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          Orders ({orders.length})
        </h2>

        {orders.length === 0 ? (
          <p className="mt-4">No orders match these filters.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {orders.map((order) => {
              const profile = getRelated(order.profiles);
              const lunchDay = getRelated(order.lunch_days);

              const orderTotal = order.order_items.reduce(
                (total, item) =>
                  total +
                  Number(item.unit_price) * item.quantity,
                0,
              );

              return (
                <article
                  key={order.id}
                  className="rounded border p-4"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">
                        {profile?.full_name ?? "Unnamed user"}
                      </h3>

                      <p>
                        Lunch:{" "}
                        {lunchDay?.lunch_date ?? "Unknown date"}
                      </p>

                      <p>
                        Submitted:{" "}
                        {formatCreatedAt(order.created_at)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p>
                        Status: <strong>{order.status}</strong>
                      </p>

                      <p className="mt-1 font-semibold">
                        Total: ${orderTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="p-2">Item</th>
                          <th className="p-2">Qty</th>
                          <th className="p-2">Unit price</th>
                          <th className="p-2">Subtotal</th>
                        </tr>
                      </thead>

                      <tbody>
                        {order.order_items.map((item) => {
                          const menuItem = getRelated(
                            item.menu_items,
                          );

                          const subtotal =
                            Number(item.unit_price) *
                            item.quantity;

                          return (
                            <tr key={item.id} className="border-b">
                              <td className="p-2">
                                {menuItem?.name ?? "Menu item"}
                              </td>
                              <td className="p-2">
                                {item.quantity}
                              </td>
                              <td className="p-2">
                                $
                                {Number(
                                  item.unit_price,
                                ).toFixed(2)}
                              </td>
                              <td className="p-2">
                                ${subtotal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}