"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  classifySignupEmail,
  completeCompanySignup,
  requestExternalSignup,
} from "@/app/signup/actions";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  COMPANY_SIGNUP_CHECK_EMAIL_BODY,
  COMPANY_SIGNUP_CHECK_EMAIL_TITLE,
  EXTERNAL_SIGNUP_SUCCESS_BODY,
  EXTERNAL_SIGNUP_SUCCESS_TITLE,
} from "@/lib/signup";

type Stage =
  | { kind: "start" }
  | { kind: "company"; fullName: string; email: string }
  | { kind: "external"; fullName: string; email: string }
  | { kind: "external-submitted" }
  | { kind: "company-check-email" };

type Props = {
  initialError?: string;
  initialMessage?: string;
};

function errorMessage(code?: string): string | null {
  switch (code) {
    case "invalid":
      return "Check the information and try again.";
    case "password":
      return "Password must be at least 8 characters.";
    case "password-mismatch":
      return "Passwords do not match.";
    case "signup":
      return "Unable to create account. Check the information and try again.";
    case "unavailable":
      return "This email address cannot be used for a new access request.";
    default:
      return null;
  }
}

export function SignupWorkspace({ initialError, initialMessage }: Props) {
  const [stage, setStage] = useState<Stage>(() => {
    if (initialMessage === "check-email") {
      return { kind: "company-check-email" };
    }
    return { kind: "start" };
  });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(
    errorMessage(initialError) ?? null,
  );
  const [isPending, startTransition] = useTransition();

  function handleContinue(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    startTransition(async () => {
      const result = await classifySignupEmail({ fullName, email });

      if (!result.success) {
        setFormError("Enter a valid full name and email address.");
        return;
      }

      if (result.path === "company") {
        setStage({ kind: "company", fullName: fullName.trim(), email: email.trim() });
        return;
      }

      setStage({ kind: "external", fullName: fullName.trim(), email: email.trim() });
    });
  }

  function handleRequestAccess(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (stage.kind !== "external") {
      return;
    }

    startTransition(async () => {
      const result = await requestExternalSignup({
        fullName: stage.fullName,
        email: stage.email,
      });

      if (!result.success) {
        if (result.error === "unavailable") {
          setFormError(
            "This email address cannot be used for a new access request.",
          );
          return;
        }
        if (result.error === "company") {
          setFormError("Use the company email signup path for this address.");
          return;
        }
        setFormError("Unable to submit your request. Try again.");
        return;
      }

      setStage({ kind: "external-submitted" });
    });
  }

  if (stage.kind === "external-submitted") {
    return (
      <>
        <h1 className="text-xl font-semibold">{EXTERNAL_SIGNUP_SUCCESS_TITLE}</h1>
        <Alert variant="success" className="mt-4">
          {EXTERNAL_SIGNUP_SUCCESS_BODY}
        </Alert>
        <p className="mt-4 text-center text-sm text-muted">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </>
    );
  }

  if (stage.kind === "company-check-email") {
    return (
      <>
        <h1 className="text-xl font-semibold">{COMPANY_SIGNUP_CHECK_EMAIL_TITLE}</h1>
        <Alert variant="success" className="mt-4">
          {COMPANY_SIGNUP_CHECK_EMAIL_BODY}
        </Alert>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-primary underline-offset-2 hover:underline">
            Return to sign in
          </Link>
        </p>
      </>
    );
  }

  if (stage.kind === "company") {
    return (
      <>
        <h1 className="text-xl font-semibold">Create account</h1>
        {formError ? (
          <Alert variant="error" className="mt-4">
            {formError}
          </Alert>
        ) : null}

        <form action={completeCompanySignup} className="mt-6 space-y-4">
          <input type="hidden" name="fullName" value={stage.fullName} />
          <input type="hidden" name="email" value={stage.email} />

          <FormField label="Full name" htmlFor="fullNameDisplay">
            <input
              id="fullNameDisplay"
              type="text"
              value={stage.fullName}
              readOnly
              className={`${inputClassName} bg-slate-50`}
            />
          </FormField>

          <FormField label="Email" htmlFor="emailDisplay">
            <input
              id="emailDisplay"
              type="email"
              value={stage.email}
              readOnly
              className={`${inputClassName} bg-slate-50`}
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

          <FormField label="Confirm password" htmlFor="confirmPassword">
            <input
              id="confirmPassword"
              name="confirmPassword"
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
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setStage({ kind: "start" })}
          >
            Start over
          </button>
        </p>
      </>
    );
  }

  if (stage.kind === "external") {
    return (
      <>
        <h1 className="text-xl font-semibold">Request access</h1>
        <p className="mt-2 text-sm text-muted">
          External email addresses require HR approval before an account can be created.
        </p>
        {formError ? (
          <Alert variant="error" className="mt-4">
            {formError}
          </Alert>
        ) : null}

        <form onSubmit={handleRequestAccess} className="mt-6 space-y-4">
          <FormField label="Full name" htmlFor="fullNameExternal">
            <input
              id="fullNameExternal"
              type="text"
              value={stage.fullName}
              readOnly
              className={`${inputClassName} bg-slate-50`}
            />
          </FormField>

          <FormField label="Email" htmlFor="emailExternal">
            <input
              id="emailExternal"
              type="email"
              value={stage.email}
              readOnly
              className={`${inputClassName} bg-slate-50`}
            />
          </FormField>

          <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
            {isPending ? "Submitting…" : "Request access"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setStage({ kind: "start" })}
          >
            Start over
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Create account</h1>
      {formError ? (
        <Alert variant="error" className="mt-4">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleContinue} className="mt-6 space-y-4">
        <FormField label="Full name" htmlFor="fullName">
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
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
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Checking…" : "Continue"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
