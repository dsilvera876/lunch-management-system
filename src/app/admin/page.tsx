import { requireAdmin } from "@/lib/auth";

export default async function AdminPage() {
  const profile = await requireAdmin();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>

      <p className="mt-4">
        Signed in as {profile.full_name ?? "Administrator"}.
      </p>

      <p className="mt-4">
        Lunch and menu management will be added here in the next phase.
      </p>
    </main>
  );
}