import Link from "next/link";
import { signup } from "../login/actions";

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>

      {params.error && (
        <p className="mb-4 rounded border p-3">
          Unable to create account. Check the information and try again.
        </p>
      )}

      <form action={signup} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            className="w-full rounded border p-2"
          />
        </div>

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
            minLength={8}
            required
            className="w-full rounded border p-2"
          />
        </div>

        <button type="submit" className="w-full rounded border p-2">
          Create account
        </button>
      </form>

      <p className="mt-4">
        Already registered?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}