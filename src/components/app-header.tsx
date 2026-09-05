import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

export async function AppHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
        <Link href="/" className="font-semibold">
          Lunch Management
        </Link>

        <nav className="flex items-center gap-4">
          {profile ? (
            <>
              <Link href="/lunch" className="underline">
                Lunch
              </Link>

              <Link href="/account" className="underline">
                Account
              </Link>

              {profile.role === "admin" && (
                <Link href="/admin" className="underline">
                  Admin
                </Link>
              )}

              <form action="/auth/signout" method="post">
                <button type="submit" className="underline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="underline">
                Sign in
              </Link>

              <Link href="/signup" className="underline">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}