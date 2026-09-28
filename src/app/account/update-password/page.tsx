import Link from "next/link";
import { updatePassword } from "./actions";
import { AuthLayout } from "@/components/auth-layout";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth-recovery";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

type Props = {
  searchParams: Promise<{
    recovery?: string;
    invite?: string;
    error?: string;
  }>;
};

export default async function UpdatePasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const isRecovery = params.recovery === "1";
  const isInvite = params.invite === "1";

  if (!isRecovery && !isInvite) {
    await requireProfile();
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const { redirect } = await import("next/navigation");
      redirect(isInvite ? "/login?error=setup-link" : FORGOT_PASSWORD_PATH);
    }
  }

  const form = (
    <>
      {params.error === "policy" && (
        <Alert variant="error" className="mt-4">
          Password must be at least {MIN_PASSWORD_LENGTH} characters.
        </Alert>
      )}

      {params.error === "mismatch" && (
        <Alert variant="error" className="mt-4">
          Passwords do not match.
        </Alert>
      )}

      {(params.error === "invalid" || params.error === "update") && (
        <Alert variant="error" className="mt-4">
          Unable to update your password. Check the information and try again.
        </Alert>
      )}

      <form action={updatePassword} className="mt-6 space-y-4">
        {isRecovery && <input type="hidden" name="recovery" value="1" />}
        {isInvite && <input type="hidden" name="invite" value="1" />}

        <FormField
          label="New password"
          htmlFor="password"
          description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <input
            id="password"
            name="password"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            autoComplete="new-password"
            className={inputClassName}
          />
        </FormField>

        <FormField label="Confirm new password" htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            autoComplete="new-password"
            className={inputClassName}
          />
        </FormField>

        <FormSubmitButton
          pendingText={isInvite ? "Setting password..." : "Saving..."}
          variant="primary"
          className="w-full"
        >
          {isInvite ? "Set password" : "Update password"}
        </FormSubmitButton>
      </form>

      {isRecovery ? (
        <p className="mt-4 text-center text-sm text-muted">
          Link expired?{" "}
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Request a new reset link
          </Link>
        </p>
      ) : null}

      {!isRecovery && !isInvite ? (
        <p className="mt-4 text-center text-sm text-muted">
          <Link
            href="/account"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Back to account
          </Link>
        </p>
      ) : null}
    </>
  );

  if (isRecovery || isInvite) {
    return (
      <AuthLayout variant="onboarding">
        <h1 className="text-xl font-semibold">
          {isInvite ? "Set your password" : "Choose a new password"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isInvite
            ? "Choose a password to finish setting up your Lunch Management System account."
            : "Enter and confirm your new password to finish resetting your account."}
        </p>
        {form}
      </AuthLayout>
    );
  }

  return (
    <>
      <PageHeader
        title="Change password"
        description="Update the password you use to sign in."
      />
      <Card className="max-w-xl">{form}</Card>
    </>
  );
}
