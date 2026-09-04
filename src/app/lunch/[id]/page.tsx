import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { submitLunchOrder } from "../actions";

type Props = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
    ordered?: string;
  }>;
};

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function LunchOrderPage({
  params,
  searchParams,
}: Props) {
  const profile = await requireProfile();
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  const { data: lunchDay, error } = await supabase
    .from("lunch_days")
    .select(`
      id,
      lunch_date,
      order_deadline,
      status,
      notes,
      menu_items (
        id,
        name,
        description,
        price,
        is_active
      )
    `)
    .eq("id", id)
    .single();

  if (error || !lunchDay) {
    notFound();
  }

  const { data: existingOrder } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      order_items (
        id,
        quantity,
        unit_price,
        menu_items (
          name
        )
      )
    `)
    .eq("profile_id", profile.id)
    .eq("lunch_day_id", id)
    .neq("status", "cancelled")
    .maybeSingle();

  const canOrder =
    lunchDay.status === "open" &&
    !existingOrder;

  const activeItems = lunchDay.menu_items.filter(
    (item) => item.is_active,
  );

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/lunch" className="underline">
        Back to lunches
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">
        Lunch — {lunchDay.lunch_date}
      </h1>

      <p className="mt-2">
        Ordering deadline: {formatDeadline(lunchDay.order_deadline)}
      </p>

      {lunchDay.notes && (
        <p className="mt-2">{lunchDay.notes}</p>
      )}

      {query.ordered && (
        <p className="mt-6 rounded border p-3">
          Your order was submitted successfully.
        </p>
      )}

      {query.error && (
        <p className="mt-6 rounded border p-3">
          Unable to submit order: {query.error}
        </p>
      )}

      {existingOrder ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Your order</h2>

          <div className="mt-4 space-y-2">
            {existingOrder.order_items.map((item) => (
              <div key={item.id} className="rounded border p-3">
                <p className="font-semibold">
                  {item.menu_items?.[0]?.name ?? "Menu item"}
                </p>

                <p>
                  Quantity: {item.quantity} · $
                  {Number(item.unit_price).toFixed(2)} each
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : !canOrder ? (
        <p className="mt-8">
          Ordering is closed for this lunch.
        </p>
      ) : activeItems.length === 0 ? (
        <p className="mt-8">
          No menu items are currently available.
        </p>
      ) : (
        <form action={submitLunchOrder} className="mt-8">
          <input
            type="hidden"
            name="lunchDayId"
            value={lunchDay.id}
          />

          <div className="space-y-4">
            {activeItems.map((item) => (
              <div key={item.id} className="rounded border p-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-semibold">{item.name}</p>

                    {item.description && (
                      <p className="mt-1">{item.description}</p>
                    )}

                    <p className="mt-1">
                      ${Number(item.price).toFixed(2)}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor={`quantity:${item.id}`}
                      className="block"
                    >
                      Qty
                    </label>

                    <input
                      id={`quantity:${item.id}`}
                      name={`quantity:${item.id}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue="0"
                      className="w-20 rounded border p-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="mt-6 rounded border px-4 py-2"
          >
            Submit order
          </button>
        </form>
      )}
    </main>
  );
}