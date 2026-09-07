import Link from "next/link";
import { login } from "./actions";
import { AuthLayout } from "@/components/auth-layout";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FORGOT_PASSWORD_PATH, PASSWORD_UPDATED_MESSAGE } from "@/lib/auth-recovery";

type Props = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold">Sign in</h1>

      {params.message === "check-email" && (
        <Alert variant="success" className="mt-4">
          Check your email to confirm your account.
        </Alert>
      )}

      {params.message === "password-updated" && (
        <Alert variant="success" className="mt-4">
          {PASSWORD_UPDATED_MESSAGE}
        </Alert>
      )}

      {params.error === "confirmation" && (
        <Alert variant="error" className="mt-4">
          Email confirmation link is invalid or has expired.
        </Alert>
      )}

      {params.error === "unconfirmed" && (
        <Alert variant="error" className="mt-4">
          Confirm your email before signing in.
        </Alert>
      )}

      {params.error === "credentials" && (
        <Alert variant="error" className="mt-4">
          Unable to sign in. Check your email and password.
        </Alert>
      )}

      {params.error === "invalid" && (
        <Alert variant="error" className="mt-4">
          Enter a valid email and password.
        </Alert>
      )}

      <form action={login} className="mt-6 space-y-4">
        <FormField label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClassName}
          />
        </FormField>

        <FormField label="Password" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClassName}
          />
        </FormField>

        <div className="text-right">
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-2 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
