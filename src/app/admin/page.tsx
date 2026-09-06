import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  cutoffTimeToFormValue,
  DEFAULT_ORDER_CUTOFF_TIME,
  formatJamaicaWallClockTime,
} from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { updateOrderCutoff } from "./actions";

type Props = {
  searchParams: Promise<{
    error?: string;
    "cutoff-updated"?: string;
  }>;
};

export default async function AdminPage({ searchParams }: Props) {
  const profile = await requireAdmin();
  const params = await searchParams;
  const supabase = await createClient();

  const [
    { count: openLunchDays },
    { count: submittedOrders },
    { count: fulfilledOrders },
    { data: upcomingLunches },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("lunch_days")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),

    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),

    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "fulfilled"),

    supabase
      .from("lunch_days")
      .select(`
        id,
        lunch_date,
        status,
        provider_id,
        lunch_providers (
          name
        )
      `)
      .gte("lunch_date", getJamaicaTodayDate())
      .order("lunch_date", { ascending: true })
      .limit(5),

    supabase
      .from("app_settings")
      .select("order_cutoff_time")
      .eq("id", 1)
      .single(),
  ]);

  const cutoffTime = settings?.order_cutoff_time ?? DEFAULT_ORDER_CUTOFF_TIME;
  const cutoffInputValue = cutoffTimeToFormValue(cutoffTime);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>

      <p className="mt-2">
        Signed in as {profile.full_name ?? "Administrator"}.
      </p>

      {params["cutoff-updated"] && (
        <p className="mt-4 rounded border p-3">
          Order cutoff updated successfully.
        </p>
      )}

      {params.error && (
        <p className="mt-4 rounded border p-3">
          Unable to update order cutoff.
        </p>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded border p-4">
          <p className="text-sm">Open lunch days</p>
          <p className="mt-2 text-3xl font-semibold">
            {openLunchDays ?? 0}
          </p>
        </div>

        <div className="rounded border p-4">
          <p className="text-sm">Submitted orders</p>
          <p className="mt-2 text-3xl font-semibold">
            {submittedOrders ?? 0}
          </p>
        </div>

        <div className="rounded border p-4">
          <p className="text-sm">Fulfilled orders</p>
          <p className="mt-2 text-3xl font-semibold">
            {fulfilledOrders ?? 0}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Ordering settings</h2>

        <p className="mt-2 max-w-3xl text-sm">
          Employees order Monday–Friday for next-business-day delivery. Lunch
          days are created automatically when the first order is placed for a
          provider and delivery date.
        </p>

        <form action={updateOrderCutoff} className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="orderCutoffTime" className="block">
              Daily order cutoff (Jamaica time)
            </label>

            <input
              id="orderCutoffTime"
              name="orderCutoffTime"
              type="time"
              required
              defaultValue={cutoffInputValue}
              className="rounded border p-2"
            />
          </div>

          <button type="submit" className="rounded border px-4 py-2">
            Save cutoff
          </button>
        </form>

        <p className="mt-2 text-sm">
          Current cutoff: {formatJamaicaWallClockTime(cutoffTime)} Jamaica time.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Management</h2>

        <div className="mt-4 flex flex-wrap gap-4">
          <Link
            href="/admin/providers"
            className="rounded border px-4 py-2"
          >
            Lunch providers
          </Link>

          <Link
            href="/admin/lunch-days"
            className="rounded border px-4 py-2"
          >
            Manage lunch days
          </Link>

          <Link
            href="/admin/orders"
            className="rounded border px-4 py-2"
          >
            View orders
          </Link>
        </div>

        <p className="mt-3 max-w-3xl text-sm">
          Configure recurring provider menus under <strong>Lunch providers</strong>.
          Manual lunch days remain available for legacy orders only.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          Upcoming lunch days
        </h2>

        {!upcomingLunches || upcomingLunches.length === 0 ? (
          <p className="mt-4">No upcoming lunch days.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingLunches.map((day) => {
              const provider = Array.isArray(day.lunch_providers)
                ? day.lunch_providers[0]
                : day.lunch_providers;

              return (
                <div
                  key={day.id}
                  className="flex items-center justify-between rounded border p-4"
                >
                  <div>
                    <p className="font-semibold">{day.lunch_date}</p>
                    <p className="text-sm">
                      Status: {day.status}
                      {provider?.name ? ` · ${provider.name}` : ""}
                    </p>
                  </div>

                  <Link
                    href={`/admin/lunch-days/${day.id}`}
                    className="underline"
                  >
                    Manage
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
