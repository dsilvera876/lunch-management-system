import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function LunchPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: lunchDays, error } = await supabase
    .from("lunch_days")
    .select(`
      id,
      lunch_date,
      order_deadline,
      notes,
      menu_items (
        id,
        name,
        description,
        price,
        is_active
      )
    `)
    .eq("status", "open")
    .gt("order_deadline", new Date().toISOString())
    .order("lunch_date", { ascending: true });

  if (error) {
    throw new Error("Unable to load available lunches.");
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("lunch_day_id, status")
    .eq("profile_id", profile.id);

  const orderedLunchDays = new Set(
    orders
      ?.filter((order) => order.status !== "cancelled")
      .map((order) => order.lunch_day_id) ?? [],
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Lunch</h1>

      <p className="mt-2">
        Welcome, {profile.full_name ?? "User"}.
      </p>

      {lunchDays.length === 0 ? (
        <p className="mt-8">
          There are currently no lunches open for ordering.
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {lunchDays.map((day) => {
            const activeItems = day.menu_items.filter(
              (item) => item.is_active,
            );

            return (
              <div key={day.id} className="rounded border p-4">
                <h2 className="text-lg font-semibold">
                  {day.lunch_date}
                </h2>

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

                {orderedLunchDays.has(day.id) ? (
                  <p className="mt-4 font-semibold">
                    Order submitted
                  </p>
                ) : (
                  <Link
                    href={`/lunch/${day.id}`}
                    className="mt-4 inline-block underline"
                  >
                    View menu and order
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}