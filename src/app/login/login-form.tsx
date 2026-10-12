"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { login } from "./actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { IconArrowRight, IconEnvelope, IconEye, IconEyeOff, IconLock } from "@/components/icons/line-icons";
import { Alert } from "@/components/ui/alert";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth-recovery";
import {
  initialLoginFormState,
  LOGIN_ERROR_MESSAGES,
  type LoginErrorCode,
} from "@/lib/login-form";

const loginInputClassName =
  "block w-full min-h-11 rounded-lg border border-staff-form bg-surface py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-none";

function LoginField({
  label,
  htmlFor,
  icon,
  trailing,
  children,
}: {
  label: string;
  htmlFor: string;
  icon: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
        {children}
        {trailing ? (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>
        ) : null}
      </div>
    </div>
  );
}

export function LoginForm({ urlError }: { urlError?: LoginErrorCode }) {
  const [state, formAction] = useActionState(login, initialLoginFormState(urlError));
  const [showPassword, setShowPassword] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const emailId = useId();
  const passwordId = useId();

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
          className="mt-5"
        >
          {errorMessage}
        </Alert>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4">
        <LoginField
          label="Email address"
          htmlFor={emailId}
          icon={<IconEnvelope size={18} aria-hidden />}
        >
          <input
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={state.email}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={describedBy}
            className={`${loginInputClassName} pl-10 pr-3`}
          />
        </LoginField>

        <LoginField
          label="Password"
          htmlFor={passwordId}
          icon={<IconLock size={18} aria-hidden />}
          trailing={
            <button
              type="button"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={showPassword ? "Hide typed characters" : "Show typed characters"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          }
        >
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={describedBy}
            className={`${loginInputClassName} pl-10 pr-11`}
          />
        </LoginField>

        <div className="flex justify-end pt-1">
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="text-sm font-medium text-staff-teal underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Forgot password?
          </Link>
        </div>

        <FormSubmitButton
          variant="primary"
          staffPrimaryCta
          focusableWhilePending
          pendingText="Signing in…"
          className="mt-2 w-full gap-2"
        >
          Sign in
          <IconArrowRight size={18} aria-hidden />
        </FormSubmitButton>
      </form>
    </>
  );
}
