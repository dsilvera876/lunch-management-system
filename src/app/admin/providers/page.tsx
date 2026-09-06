import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createProvider } from "./actions";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
  }>;
};

export default async function ProvidersPage({ searchParams }: Props) {
  await requireAdmin();

  const params = await searchParams;
  const supabase = await createClient();

  const { data: providers, error } = await supabase
    .from("lunch_providers")
    .select("id, name, description, active, created_at")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Unable to load lunch providers.");
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Lunch Providers</h1>
          <p className="mt-2 max-w-3xl text-sm">
            Configure recurring Monday–Friday provider menus. This is the
            future HR workflow; existing lunch-day ordering remains available
            until Batch 2 connects providers to daily orders.
          </p>
        </div>

        <Link href="/admin" className="underline">
          Admin dashboard
        </Link>
      </div>

      {params.created && (
        <p className="mt-4 rounded border p-3">Provider created successfully.</p>
      )}

      {params.error === "duplicate" && (
        <p className="mt-4 rounded border p-3">
          A provider with that name already exists.
        </p>
      )}

      {params.error && params.error !== "duplicate" && (
        <p className="mt-4 rounded border p-3">
          Unable to complete that action.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Add provider</h2>

        <form action={createProvider} className="mt-4 grid max-w-xl gap-4">
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
              rows={3}
              className="w-full rounded border p-2"
            />
          </div>

          <button type="submit" className="w-fit rounded border px-4 py-2">
            Create provider
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Providers</h2>

        {!providers || providers.length === 0 ? (
          <p className="mt-4">No providers have been created yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Name</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id} className="border-b">
                    <td className="p-2 font-semibold">{provider.name}</td>
                    <td className="p-2">{provider.description ?? "—"}</td>
                    <td className="p-2">
                      {provider.active ? "Active" : "Inactive"}
                    </td>
                    <td className="p-2">
                      <Link
                        href={`/admin/providers/${provider.id}`}
                        className="underline"
                      >
                        Manage menu
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
