import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  cancelLunchOrder,
  submitLunchOrder,
  updateLunchOrder,
} from "../actions";

type Props = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
    ordered?: string;
    updated?: string;
    cancelled?: string;
    edit?: string;
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
        menu_item_id,
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

  const activeItems = lunchDay.menu_items.filter(
    (item) => item.is_active,
  );

  const isEditing =
    query.edit === "1" &&
    existingOrder?.status === "submitted";

  const quantities = new Map(
    existingOrder?.order_items.map((item) => [
      item.menu_item_id,
      item.quantity,
    ]) ?? [],
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

      {query.updated && (
        <p className="mt-6 rounded border p-3">
          Your order was updated successfully.
        </p>
      )}

      {query.cancelled && (
        <p className="mt-6 rounded border p-3">
          Your order was cancelled. You may place a new order while
          ordering remains open.
        </p>
      )}

      {query.error && (
        <p className="mt-6 rounded border p-3">
          Unable to complete the request: {query.error}
        </p>
      )}

      {existingOrder && !isEditing ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Your order</h2>

          <div className="mt-4 space-y-2">
            {existingOrder.order_items.map((item) => {
              const menuItem = getRelated(item.menu_items);

              return (
                <div key={item.id} className="rounded border p-3">
                  <p className="font-semibold">
                    {menuItem?.name ?? "Menu item"}
                  </p>

                  <p>
                    Quantity: {item.quantity} · $
                    {Number(item.unit_price).toFixed(2)} each
                  </p>
                </div>
              );
            })}
          </div>

          {existingOrder.status === "submitted" &&
            lunchDay.status === "open" && (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/lunch/${lunchDay.id}?edit=1`}
                  className="rounded border px-4 py-2"
                >
                  Edit order
                </Link>

                <form action={cancelLunchOrder}>
                  <input
                    type="hidden"
                    name="lunchDayId"
                    value={lunchDay.id}
                  />

                  <input
                    type="hidden"
                    name="orderId"
                    value={existingOrder.id}
                  />

                  <button
                    type="submit"
                    className="rounded border px-4 py-2"
                  >
                    Cancel order
                  </button>
                </form>
              </div>
            )}
        </section>
      ) : lunchDay.status !== "open" ? (
        <p className="mt-8">
          Ordering is closed for this lunch.
        </p>
      ) : activeItems.length === 0 ? (
        <p className="mt-8">
          No menu items are currently available.
        </p>
      ) : (
        <form
          action={isEditing ? updateLunchOrder : submitLunchOrder}
          className="mt-8"
        >
          <input
            type="hidden"
            name="lunchDayId"
            value={lunchDay.id}
          />

          {isEditing && existingOrder && (
            <input
              type="hidden"
              name="orderId"
              value={existingOrder.id}
            />
          )}

          <h2 className="text-xl font-semibold">
            {isEditing ? "Edit your order" : "Place your order"}
          </h2>

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
                      defaultValue={
                        isEditing
                          ? quantities.get(item.id) ?? 0
                          : 0
                      }
                      className="w-20 rounded border p-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              className="rounded border px-4 py-2"
            >
              {isEditing ? "Save changes" : "Submit order"}
            </button>

            {isEditing && (
              <Link
                href={`/lunch/${lunchDay.id}`}
                className="rounded border px-4 py-2"
              >
                Cancel editing
              </Link>
            )}
          </div>
        </form>
      )}
    </main>
  );
}