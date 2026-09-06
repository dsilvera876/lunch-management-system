import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { submitLunchOrder } from "../actions";

type Props = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
};

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

function getErrorMessage(code: string) {
  switch (code) {
    case "empty":
      return "Select at least one menu item before submitting.";
    case "deadline":
      return "The ordering deadline has passed.";
    case "closed":
      return "Ordering is no longer open for this lunch.";
    case "unavailable-item":
      return "One of the selected menu items is no longer available.";
    default:
      return "Unable to complete the request. Please try again.";
  }
}

export default async function LegacyLunchOrderPage({
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
      provider_id,
      menu_items (
        id,
        name,
        description,
        price,
        is_active
      )
    `)
    .eq("id", id)
    .is("provider_id", null)
    .single();

  if (error || !lunchDay) {
    notFound();
  }

  const { data: existingOrders } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      order_items (
        quantity,
        menu_items (
          name
        )
      )
    `)
    .eq("profile_id", profile.id)
    .eq("lunch_day_id", id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  const activeItems = lunchDay.menu_items.filter((item) => item.is_active);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/lunch" className="underline">
        Back to lunch
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

      {query.error && (
        <p className="mt-6 rounded border p-3">
          {getErrorMessage(query.error)}
        </p>
      )}

      {existingOrders && existingOrders.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Your orders</h2>

          <div className="mt-4 space-y-4">
            {existingOrders.map((order) => (
              <article key={order.id} className="rounded border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-semibold">Status: {order.status}</p>

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
            ))}
          </div>
        </section>
      )}

      {lunchDay.status !== "open" ? (
        <p className="mt-8">
          Ordering is closed for this lunch.
        </p>
      ) : activeItems.length === 0 ? (
        <p className="mt-8">
          No menu items are currently available.
        </p>
      ) : (
        <form action={submitLunchOrder} className="mt-8">
          <input type="hidden" name="lunchDayId" value={lunchDay.id} />

          <h2 className="text-xl font-semibold">Place an order</h2>

          <div className="mt-4 space-y-4">
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
                      defaultValue={0}
                      className="w-20 rounded border p-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <FormSubmitButton
              pendingText="Submitting..."
              className="rounded border px-4 py-2 disabled:opacity-50"
            >
              Submit order
            </FormSubmitButton>
          </div>
        </form>
      )}
    </main>
  );
}
