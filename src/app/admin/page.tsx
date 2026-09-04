import Link from "next/link";
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
        Manage lunch days, menus, and employee orders from here.
      </p>

      <div className="mt-6 space-y-3">
        <div>
          <Link href="/admin/lunch-days" className="underline">
            Manage lunch days
          </Link>
        </div>

        <div>
          <Link href="/admin/orders" className="underline">
            View orders
          </Link>
        </div>
      </div>
    </main>
  );
}