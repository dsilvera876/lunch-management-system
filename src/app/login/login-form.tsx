"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { login } from "./actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth-recovery";
import {
  initialLoginFormState,
  LOGIN_ERROR_MESSAGES,
  type LoginErrorCode,
} from "@/lib/login-form";

export function LoginForm({ urlError }: { urlError?: LoginErrorCode }) {
  const [state, formAction] = useActionState(login, initialLoginFormState(urlError));
  const errorRef = useRef<HTMLDivElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (state.attempt > 0 && state.error) {
      errorRef.current?.focus();
    }
  }, [state.attempt, state.error]);

  const errorMessage = state.error ? LOGIN_ERROR_MESSAGES[state.error] : null;
  const describedBy = errorMessage ? errorId : undefined;

  return (
    <>
      {errorMessage ? (
        <Alert
          ref={errorRef}
          id={errorId}
          variant="error"
          liveRegion={state.attempt === 0}
          className="mt-4"
        >
          {errorMessage}
        </Alert>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4">
        <FormField label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={state.email}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={describedBy}
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
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={describedBy}
            className={inputClassName}
          />
        </FormField>

        <div className="text-right">
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="text-sm font-medium text-staff-teal underline-offset-2 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <FormSubmitButton
          variant="primary"
          staffPrimaryCta
          focusableWhilePending
          pendingText="Signing in…"
          className="w-full"
        >
          Sign in
        </FormSubmitButton>
      </form>
    </>
  );
}
