import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const [
    { count: openLunchDays },
    { count: submittedOrders },
    { count: fulfilledOrders },
    { data: upcomingLunches },
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
      .select("id, lunch_date, status")
      .gte("lunch_date", new Date().toISOString().slice(0, 10))
      .order("lunch_date", { ascending: true })
      .limit(5),
  ]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>

      <p className="mt-2">
        Signed in as {profile.full_name ?? "Administrator"}.
      </p>

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
        <h2 className="text-xl font-semibold">Management</h2>

        <div className="mt-4 flex flex-wrap gap-4">
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
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          Upcoming lunch days
        </h2>

        {!upcomingLunches || upcomingLunches.length === 0 ? (
          <p className="mt-4">No upcoming lunch days.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingLunches.map((day) => (
              <div
                key={day.id}
                className="flex items-center justify-between rounded border p-4"
              >
                <div>
                  <p className="font-semibold">{day.lunch_date}</p>
                  <p className="text-sm">Status: {day.status}</p>
                </div>

                <Link
                  href={`/admin/lunch-days/${day.id}`}
                  className="underline"
                >
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}