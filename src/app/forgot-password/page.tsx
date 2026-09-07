import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { AuthLayout } from "@/components/auth-layout";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField, inputClassName } from "@/components/ui/form-field";
import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
} from "@/lib/auth-recovery";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold">Reset password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter your email address and we will send you a reset link.
      </p>

      {params.message === "reset-sent" && (
        <Alert variant="success" className="mt-4">
          {PASSWORD_RESET_SUCCESS_MESSAGE}
        </Alert>
      )}

      {params.error === "invalid-email" && (
        <Alert variant="error" className="mt-4">
          Enter a valid email address.
        </Alert>
      )}

      {params.error === "temporary" && (
        <Alert variant="error" className="mt-4">
          Unable to send a reset link right now. Please try again shortly.
        </Alert>
      )}

      {params.error === "invalid-link" && (
        <Alert variant="error" className="mt-4">
          {PASSWORD_RESET_INVALID_LINK_MESSAGE}{" "}
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Request a new reset link
          </Link>
          .
        </Alert>
      )}

      <form action={requestPasswordReset} className="mt-6 space-y-4">
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

        <FormSubmitButton pendingText="Sending..." variant="primary" className="w-full">
          Send reset link
        </FormSubmitButton>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Remember your password?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
