export type LoginErrorCode = "credentials" | "invalid" | "unconfirmed";

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  credentials: "Unable to sign in. Check your email and password.",
  invalid: "Enter a valid email and password.",
  unconfirmed: "Confirm your email before signing in.",
};

/**
 * Returned by the sign-in action instead of redirecting with query parameters, so a failed
 * attempt keeps the typed email in client state without putting it in the URL. The password
 * is never echoed back. `attempt` changes on every failure so focus moves to the error again.
 */
export type LoginFormState = {
  error: LoginErrorCode | null;
  email: string;
  attempt: number;
};

export function isLoginErrorCode(value: unknown): value is LoginErrorCode {
  return value === "credentials" || value === "invalid" || value === "unconfirmed";
}

export function initialLoginFormState(urlError: string | undefined): LoginFormState {
  return { error: isLoginErrorCode(urlError) ? urlError : null, email: "", attempt: 0 };
}

export function failedLoginState(
  previous: LoginFormState,
  error: LoginErrorCode,
  email: unknown,
): LoginFormState {
  return {
    error,
    email: typeof email === "string" ? email.trim().slice(0, 320) : "",
    attempt: previous.attempt + 1,
  };
}
