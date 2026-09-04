import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .single();

  if (profileError) {
    throw new Error("Unable to load profile.");
  }

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
      </div>

      <form action="/auth/signout" method="post" className="mt-8">
        <button type="submit" className="rounded border px-4 py-2">
          Sign out
        </button>
      </form>
    </main>
  );
}