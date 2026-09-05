import Link from "next/link";
import { login } from "./actions";

type Props = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>

      {params.message === "check-email" && (
        <p className="mb-4 rounded border p-3">
          Check your email to confirm your account.
        </p>
      )}

      {params.error === "confirmation" && (
        <p className="mb-4 rounded border p-3">
          Email confirmation link is invalid or has expired. Sign in after
          confirming your email, or create a new account.
        </p>
      )}

      {params.error === "unconfirmed" && (
        <p className="mb-4 rounded border p-3">
          Confirm your email before signing in. Check your inbox for the
          confirmation link.
        </p>
      )}

      {params.error === "credentials" && (
        <p className="mb-4 rounded border p-3">
          Unable to sign in. Check your email and password.
        </p>
      )}

      {params.error === "invalid" && (
        <p className="mb-4 rounded border p-3">
          Enter a valid email and password.
        </p>
      )}

      <form action={login} className="space-y-4">
        <div>
          <label htmlFor="email" className="block">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded border p-2"
          />
        </div>

        <div>
          <label htmlFor="password" className="block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded border p-2"
          />
        </div>

        <button type="submit" className="w-full rounded border p-2">
          Sign in
        </button>
      </form>

      <p className="mt-4">
        No account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}