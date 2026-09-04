import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createMenuItem,
  toggleMenuItem,
  updateLunchDay,
  updateLunchDayStatus,
} from "./actions";

type Props = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
    updated?: string;
    menuCreated?: string;
  }>;
};

function toJamaicaDateTimeLocal(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "T");
}

export default async function LunchDayPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  const { data: lunchDay, error } = await supabase
    .from("lunch_days")
    .select(
      `
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
    `,
    )
    .eq("id", id)
    .single();

  if (error || !lunchDay) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Manage Lunch Day
        </h1>

        <Link href="/admin/lunch-days" className="underline">
          Back to lunch days
        </Link>
      </div>

      {query.updated && (
        <p className="mt-4 rounded border p-3">
          Lunch day updated.
        </p>
      )}

      {query.menuCreated && (
        <p className="mt-4 rounded border p-3">
          Menu item created.
        </p>
      )}

      {query.error && (
        <p className="mt-4 rounded border p-3">
          Unable to complete that action.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Lunch details</h2>

        <form action={updateLunchDay} className="mt-4 grid max-w-xl gap-4">
          <input type="hidden" name="id" value={lunchDay.id} />

          <div>
            <label htmlFor="lunchDate" className="block">
              Lunch date
            </label>

            <input
              id="lunchDate"
              name="lunchDate"
              type="date"
              defaultValue={lunchDay.lunch_date}
              required
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="deadline" className="block">
              Ordering deadline
            </label>

            <input
              id="deadline"
              name="deadline"
              type="datetime-local"
              defaultValue={toJamaicaDateTimeLocal(
                lunchDay.order_deadline,
              )}
              required
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block">
              Notes
            </label>

            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={lunchDay.notes ?? ""}
              className="w-full rounded border p-2"
            />
          </div>

          <button
            type="submit"
            className="w-fit rounded border px-4 py-2"
          >
            Save changes
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Status</h2>

        <p className="mt-2">
          Current status: <strong>{lunchDay.status}</strong>
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {["draft", "open", "closed", "completed"].map((status) => (
            <form key={status} action={updateLunchDayStatus}>
              <input type="hidden" name="id" value={lunchDay.id} />
              <input type="hidden" name="status" value={status} />

              <button
                type="submit"
                disabled={lunchDay.status === status}
                className="rounded border px-3 py-2 disabled:opacity-50"
              >
                {status}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Add menu item</h2>

        <form action={createMenuItem} className="mt-4 grid max-w-xl gap-4">
          <input
            type="hidden"
            name="lunchDayId"
            value={lunchDay.id}
          />

          <div>
            <label htmlFor="name" className="block">
              Name
            </label>

            <input
              id="name"
              name="name"
              required
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="description" className="block">
              Description
            </label>

            <textarea
              id="description"
              name="description"
              rows={2}
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="price" className="block">
              Price
            </label>

            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              className="w-full rounded border p-2"
            />
          </div>

          <button
            type="submit"
            className="w-fit rounded border px-4 py-2"
          >
            Add menu item
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Menu</h2>

        {lunchDay.menu_items.length === 0 ? (
          <p className="mt-4">No menu items yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {lunchDay.menu_items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border p-4"
              >
                <div>
                  <p className="font-semibold">{item.name}</p>

                  {item.description && (
                    <p>{item.description}</p>
                  )}

                  <p>
                    ${Number(item.price).toFixed(2)} ·{" "}
                    {item.is_active ? "Active" : "Inactive"}
                  </p>
                </div>

                <form action={toggleMenuItem}>
                  <input
                    type="hidden"
                    name="lunchDayId"
                    value={lunchDay.id}
                  />

                  <input
                    type="hidden"
                    name="menuItemId"
                    value={item.id}
                  />

                  <input
                    type="hidden"
                    name="isActive"
                    value={String(item.is_active)}
                  />

                  <button
                    type="submit"
                    className="rounded border px-3 py-2"
                  >
                    {item.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}