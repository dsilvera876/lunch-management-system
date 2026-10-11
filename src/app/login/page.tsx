import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { Alert } from "@/components/ui/alert";
import {
  ACCOUNT_SETUP_INVALID_LINK_MESSAGE,
  PASSWORD_UPDATED_MESSAGE,
} from "@/lib/auth-recovery";
import { isLoginErrorCode } from "@/lib/login-form";
import {
  LOGIN_INACTIVE_MESSAGE,
  LOGIN_INCOMPLETE_SETUP_MESSAGE,
} from "@/lib/post-login-gate";
import { pageMetadata } from "@/lib/page-titles";
import { LoginForm } from "./login-form";

export const metadata = pageMetadata("login");

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

      {params.error === "setup-link" && (
        <Alert variant="error" className="mt-4">
          {ACCOUNT_SETUP_INVALID_LINK_MESSAGE} Contact HR to request a new invitation if your
          access was approved.
        </Alert>
      )}

      {params.error === "inactive" && (
        <Alert variant="error" className="mt-4">
          {LOGIN_INACTIVE_MESSAGE}
        </Alert>
      )}

      {params.error === "incomplete-setup" && (
        <Alert variant="error" className="mt-4">
          {LOGIN_INCOMPLETE_SETUP_MESSAGE}
        </Alert>
      )}

      <LoginForm urlError={isLoginErrorCode(params.error) ? params.error : undefined} />

      <p className="mt-4 text-center text-sm text-staff-instruction">
        No account?{" "}
        <Link
          href="/signup"
          className="font-medium text-staff-teal underline-offset-2 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
