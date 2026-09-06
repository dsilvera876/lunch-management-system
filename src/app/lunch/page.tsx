import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  getDeliveryDateForOrderDate,
  getJamaicaIsoWeekday,
  getJamaicaTodayDate,
} from "@/lib/datetime";
import { DEFAULT_ORDER_CUTOFF_TIME } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

type Related<T> = T | T[] | null;

function getRelated<T>(value: Related<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCutoffTime(value: string) {
  const [hours, minutes] = value.split(":");

  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    timeStyle: "short",
  }).format(date);
}

type Props = {
  searchParams: Promise<{
    error?: string;
    ordered?: string;
  }>;
};

export default async function LunchPage({ searchParams }: Props) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();

  const orderDate = getJamaicaTodayDate();
  const orderWeekday = getJamaicaIsoWeekday(orderDate);
  const deliveryDate = orderWeekday
    ? getDeliveryDateForOrderDate(orderDate)
    : null;

  const [
    { data: settings },
    { data: providers },
    { data: legacyLunchDays },
    { data: deliveryOrders },
  ] = await Promise.all([
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

    supabase
      .from("lunch_days")
      .select(`
        id,
        lunch_date,
        order_deadline,
        notes,
        provider_id,
        menu_items (
          id,
          name,
          description,
          price,
          is_active
        )
      `)
      .eq("status", "open")
      .is("provider_id", null)
      .gt("order_deadline", new Date().toISOString())
      .order("lunch_date", { ascending: true }),

    deliveryDate
      ? supabase
          .from("orders")
          .select(`
            id,
            status,
            created_at,
            lunch_day_id,
            lunch_days!inner (
              lunch_date,
              provider_id,
              lunch_providers (
                name
              )
            ),
            order_items (
              quantity,
              menu_items (
                name
              )
            )
          `)
          .eq("profile_id", profile.id)
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

  const orderingOpen =
    orderWeekday !== null &&
    orderDeadline !== null &&
    new Date() <= new Date(orderDeadline);

  const availableProviders =
    providers?.map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      itemCount: provider.provider_menu_items.length,
    })) ?? [];

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Lunch</h1>

      <p className="mt-2">
        Welcome, {profile.full_name ?? "User"}.
      </p>

      {params.ordered && (
        <p className="mt-4 rounded border p-3">
          Your order was submitted successfully.
        </p>
      )}

      {params.error && (
        <p className="mt-4 rounded border p-3">
          Unable to complete the request. Please try again.
        </p>
      )}

      <section id="today-ordering" className="mt-8">
        <h2 className="text-xl font-semibold">Today&apos;s ordering</h2>

        {!orderWeekday ? (
          <p className="mt-4">
            Ordering is available Monday through Friday only.
          </p>
        ) : (
          <>
            <p className="mt-2">
              Order today ({orderDate}) for delivery on{" "}
              <strong>{deliveryDate}</strong>.
            </p>

            <p className="mt-1">
              Order by {formatCutoffTime(cutoffTime)} Jamaica time
              {orderDeadline ? (
                <>
                  {" "}
                  ({formatDeadline(orderDeadline)})
                </>
              ) : null}
              .
            </p>

            {!orderingOpen ? (
              <p className="mt-4">
                Today&apos;s ordering window has closed.
              </p>
            ) : availableProviders.length === 0 ? (
              <p className="mt-4">
                No providers have menu items available for ordering today.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {availableProviders.map((provider) => (
                  <div key={provider.id} className="rounded border p-4">
                    <h3 className="text-lg font-semibold">
                      {provider.name}
                    </h3>

                    {provider.description && (
                      <p className="mt-1">{provider.description}</p>
                    )}

                    <p className="mt-2">
                      {provider.itemCount} menu{" "}
                      {provider.itemCount === 1 ? "item" : "items"} available
                      today
                    </p>

                    <Link
                      href={`/lunch/providers/${provider.id}`}
                      className="mt-4 inline-block underline"
                    >
                      Order from this provider
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {orderingOpen && availableProviders.length > 0 && (
              <p className="mt-4 text-sm">
                You may place as many separate orders as you need before the
                cutoff. Each order must come from one provider only.
              </p>
            )}
          </>
        )}
      </section>

      {deliveryOrders && deliveryOrders.length > 0 && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              Your orders for delivery on {deliveryDate}
            </h2>

            {orderingOpen && availableProviders.length > 0 && (
              <Link href="#today-ordering" className="underline">
                Place another order
              </Link>
            )}
          </div>

          <div className="mt-4 space-y-4">
            {deliveryOrders.map((order) => {
              const lunchDay = getRelated(order.lunch_days);
              const provider = lunchDay
                ? getRelated(lunchDay.lunch_providers)
                : null;

              return (
                <article key={order.id} className="rounded border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {provider?.name ?? "Lunch order"}
                      </p>

                      <p className="mt-1 text-sm">
                        Status: {order.status}
                      </p>
                    </div>

                    <Link
                      href={`/lunch/orders/${order.id}`}
                      className="underline"
                    >
                      View order
                    </Link>
                  </div>

                  <ul className="mt-3 space-y-1">
                    {order.order_items.map((item) => {
                      const menuItem = getRelated(item.menu_items);

                      return (
                        <li key={`${order.id}-${menuItem?.name ?? "item"}`}>
                          {menuItem?.name ?? "Menu item"} × {item.quantity}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {legacyLunchDays && legacyLunchDays.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Other open lunches</h2>

          <p className="mt-2 text-sm">
            Legacy manually configured lunch days remain available until fully
            replaced by provider menus.
          </p>

          <div className="mt-4 space-y-4">
            {legacyLunchDays.map((day) => {
              const activeItems = day.menu_items.filter(
                (item) => item.is_active,
              );

              return (
                <div key={day.id} className="rounded border p-4">
                  <h3 className="text-lg font-semibold">
                    {day.lunch_date}
                  </h3>

                  <p className="mt-1">
                    Order by {formatDeadline(day.order_deadline)}
                  </p>

                  {day.notes && (
                    <p className="mt-2">{day.notes}</p>
                  )}

                  <p className="mt-2">
                    {activeItems.length} menu{" "}
                    {activeItems.length === 1 ? "item" : "items"}
                  </p>

                  <Link
                    href={`/lunch/${day.id}`}
                    className="mt-4 inline-block underline"
                  >
                    Place an order
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
