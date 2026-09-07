import Link from "next/link";
import { requireLegacyLunchDays } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createLunchDay } from "./actions";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
  }>;
};

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function LunchDaysPage({ searchParams }: Props) {
  await requireLegacyLunchDays();

  const params = await searchParams;
  const supabase = await createClient();

  const { data: lunchDays, error } = await supabase
    .from("lunch_days")
    .select("id, lunch_date, order_deadline, status, notes")
    .order("lunch_date", { ascending: false });

  if (error) {
    throw new Error("Unable to load lunch days.");
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lunch Days</h1>

        <Link href="/admin" className="underline">
          Admin dashboard
        </Link>
      </div>

      {params.created && (
        <p className="mt-4 rounded border p-3">
          Lunch day created successfully.
        </p>
      )}

      {params.error === "duplicate" && (
        <p className="mt-4 rounded border p-3">
          A lunch day already exists for that date.
        </p>
      )}

      {params.error && params.error !== "duplicate" && (
        <p className="mt-4 rounded border p-3">
          Unable to create lunch day.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Create lunch day</h2>

        <form action={createLunchDay} className="mt-4 grid max-w-xl gap-4">
          <div>
            <label htmlFor="lunchDate" className="block">
              Lunch date
            </label>
            <input
              id="lunchDate"
              name="lunchDate"
              type="date"
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
              className="w-full rounded border p-2"
            />
          </div>

          <button
            type="submit"
            className="w-fit rounded border px-4 py-2"
          >
            Create lunch day
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Existing lunch days</h2>

        {lunchDays.length === 0 ? (
          <p className="mt-4">No lunch days have been created.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Deadline</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {lunchDays.map((day) => (
                  <tr key={day.id} className="border-b">
                    <td className="p-2">{day.lunch_date}</td>
                    <td className="p-2">
                      {formatDeadline(day.order_deadline)}
                    </td>
                    <td className="p-2">{day.status}</td>
                    <td className="p-2">{day.notes ?? "—"}</td>
                    <td className="p-2">
                      <Link href={`/admin/lunch-days/${day.id}`} className="underline">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}