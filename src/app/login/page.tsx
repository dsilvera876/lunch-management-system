import Link from "next/link";
import { LoginBrandLogo } from "@/components/auth/login-brand-logo";
import { LoginPageLayout } from "@/components/auth/login-page-layout";
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
    <LoginPageLayout>
      <div className="text-center">
        <LoginBrandLogo className="mx-auto text-staff-teal" />
        <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">JBDC&apos;s</p>
        <p className="mt-1 text-lg font-semibold text-staff-teal">Lunch Management System</p>
        <p className="mt-3 text-sm italic text-staff-instruction">Where Good Food Awaits</p>
      </div>

      <h1 className="sr-only">Sign in</h1>

      {params.message === "check-email" && (
        <Alert variant="success" className="mt-5">
          Check your email to confirm your account.
        </Alert>
      )}

      {params.message === "password-updated" && (
        <Alert variant="success" className="mt-5">
          {PASSWORD_UPDATED_MESSAGE}
        </Alert>
      )}

      {params.error === "confirmation" && (
        <Alert variant="error" className="mt-5">
          Email confirmation link is invalid or has expired.
        </Alert>
      )}

      {params.error === "setup-link" && (
        <Alert variant="error" className="mt-5">
          {ACCOUNT_SETUP_INVALID_LINK_MESSAGE} Contact HR to request a new invitation if your
          access was approved.
        </Alert>
      )}

      {params.error === "inactive" && (
        <Alert variant="error" className="mt-5">
          {LOGIN_INACTIVE_MESSAGE}
        </Alert>
      )}

      {params.error === "incomplete-setup" && (
        <Alert variant="error" className="mt-5">
          {LOGIN_INCOMPLETE_SETUP_MESSAGE}
        </Alert>
      )}

      <LoginForm urlError={isLoginErrorCode(params.error) ? params.error : undefined} />

      <p className="mt-6 text-center text-sm text-staff-instruction">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-semibold text-staff-teal underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Create an account
        </Link>
      </p>
    </LoginPageLayout>
  );
}
