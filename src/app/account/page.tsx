import { requireProfile } from "@/lib/auth";

export default async function AccountPage() {
  const profile = await requireProfile();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Account</h1>

      <div className="mt-6 space-y-2">
        <p>
          <strong>Name:</strong> {profile.full_name ?? "Not provided"}
        </p>

        <p>
          <strong>Role:</strong> {profile.role}
        </p>

        {profile.role === "admin" && (
          <p>
            <a href="/admin" className="underline">
              Admin dashboard
            </a>
          </p>
        )}
      </div>
    </main>
  );
}