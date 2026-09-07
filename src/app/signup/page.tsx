import Link from "next/link";
import { signup } from "../login/actions";
import { AuthLayout } from "@/components/auth-layout";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold">Create account</h1>

      {params.error && (
        <Alert variant="error" className="mt-4">
          Unable to create account. Check the information and try again.
        </Alert>
      )}

      <form action={signup} className="mt-6 space-y-4">
        <FormField label="Full name" htmlFor="fullName">
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            className={inputClassName}
          />
        </FormField>

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

        <FormField label="Password" htmlFor="password" description="At least 8 characters.">
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            className={inputClassName}
          />
        </FormField>

        <Button type="submit" variant="primary" className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
