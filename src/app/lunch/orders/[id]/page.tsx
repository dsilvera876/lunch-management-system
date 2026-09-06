import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  cancelLunchOrder,
  updateLunchOrder,
} from "../../actions";

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
    case "locked":
      return "This order can no longer be changed.";
    case "unauthorized":
      return "You are not authorized to perform this action.";
    default:
      return "Unable to complete the request. Please try again.";
  }
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await requireProfile();
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      created_at,
      lunch_day_id,
      lunch_days (
        id,
        lunch_date,
        order_date,
        order_deadline,
        status,
        notes,
        provider_id,
        lunch_providers (
          name
        ),
        menu_items (
          id,
          name,
          description,
          price,
          is_active
        )
      ),
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
    .eq("id", id)
    .eq("profile_id", profile.id)
    .single();

  if (error || !order) {
    notFound();
  }

  const lunchDay = getRelated(order.lunch_days);

  if (!lunchDay) {
    notFound();
  }

  const { data: effectiveDeadline } = lunchDay.provider_id && lunchDay.order_date
    ? await supabase.rpc("effective_order_deadline", {
        p_lunch_day_id: lunchDay.id,
      })
    : { data: lunchDay.order_deadline };

  const orderingOpen =
    lunchDay.status === "open" &&
    effectiveDeadline !== null &&
    new Date() <= new Date(effectiveDeadline);

  const provider = getRelated(lunchDay.lunch_providers);
  const activeItems = lunchDay.menu_items.filter((item) => item.is_active);

  const isEditing =
    query.edit === "1" &&
    order.status === "submitted";

  const quantities = new Map(
    order.order_items.map((item) => [item.menu_item_id, item.quantity]),
  );

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/lunch" className="underline">
        Back to lunch
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">
        {provider?.name ? `${provider.name} — ` : "Order — "}
        {lunchDay.lunch_date}
      </h1>

      {lunchDay.order_date && (
        <p className="mt-2">
          Ordered on {lunchDay.order_date} for delivery on{" "}
          {lunchDay.lunch_date}.
        </p>
      )}

      <p className="mt-2">
        Status: <strong>{order.status}</strong>
      </p>

      <p className="mt-1">
        Ordering deadline:{" "}
        {effectiveDeadline
          ? formatDeadline(effectiveDeadline)
          : formatDeadline(lunchDay.order_deadline)}
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
          This order was cancelled. You may place another order while ordering
          remains open.
        </p>
      )}

      {query.error && (
        <p className="mt-6 rounded border p-3">
          {getErrorMessage(query.error)}
        </p>
      )}

      {order.status !== "cancelled" && !isEditing ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Order items</h2>

          <div className="mt-4 space-y-2">
            {order.order_items.map((item) => {
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

          {order.status === "submitted" && orderingOpen && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/lunch/orders/${order.id}?edit=1`}
                className="rounded border px-4 py-2"
              >
                Edit order
              </Link>

              <form action={cancelLunchOrder}>
                <input type="hidden" name="orderId" value={order.id} />

                <FormSubmitButton
                  pendingText="Cancelling..."
                  confirmMessage="Cancel this order? Your other orders for this delivery date will not be affected."
                  className="rounded border px-4 py-2 disabled:opacity-50"
                >
                  Cancel order
                </FormSubmitButton>
              </form>
            </div>
          )}
        </section>
      ) : order.status === "cancelled" ? (
        <p className="mt-8">This order has been cancelled.</p>
      ) : order.status === "fulfilled" ? (
        <p className="mt-8">This order has been fulfilled.</p>
      ) : isEditing ? (
        <form action={updateLunchOrder} className="mt-8">
          <input type="hidden" name="orderId" value={order.id} />

          <h2 className="text-xl font-semibold">Edit your order</h2>

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
                      defaultValue={quantities.get(item.id) ?? 0}
                      className="w-20 rounded border p-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <FormSubmitButton
              pendingText="Saving..."
              className="rounded border px-4 py-2 disabled:opacity-50"
            >
              Save changes
            </FormSubmitButton>

            <Link
              href={`/lunch/orders/${order.id}`}
              className="rounded border px-4 py-2"
            >
              Cancel editing
            </Link>
          </div>
        </form>
      ) : null}

      {lunchDay.provider_id && lunchDay.status === "open" && orderingOpen && (
        <div className="mt-8">
          <Link
            href={`/lunch/providers/${lunchDay.provider_id}`}
            className="underline"
          >
            Place another order from {provider?.name ?? "this provider"}
          </Link>
        </div>
      )}
    </main>
  );
}
