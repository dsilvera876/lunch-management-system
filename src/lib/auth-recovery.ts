import { type EmailOtpType } from "@supabase/supabase-js";

import { appendSearchParams } from "@/lib/redirect-url";

export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const UPDATE_PASSWORD_PATH = "/account/update-password";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "If an account exists for that email address, a password reset link has been sent.";

export const PASSWORD_RESET_INVALID_LINK_MESSAGE =
  "This password reset link is invalid or has expired.";

export const ACCOUNT_SETUP_INVALID_LINK_MESSAGE =
  "Your account setup link is invalid or has expired.";

export const PASSWORD_UPDATED_MESSAGE =
  "Your password has been updated. Sign in with your new password.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Builds the redirectTo value for resetPasswordForEmail using the canonical origin. */
export function getPasswordResetRedirectTo(origin: string): string {
  return `${origin}/auth/confirm?type=recovery`;
}

export function getAuthConfirmSuccessPath(type: EmailOtpType): string | "post-login" {
  if (type === "recovery") {
    return appendSearchParams(UPDATE_PASSWORD_PATH, { recovery: "1" });
  }

  if (type === "invite") {
    return appendSearchParams(UPDATE_PASSWORD_PATH, { invite: "1" });
  }

  return "post-login";
}

export function getPasswordResetInvalidLinkPath(): string {
  return appendSearchParams(FORGOT_PASSWORD_PATH, { error: "invalid-link" });
}

export function getAuthConfirmFailurePath(type: EmailOtpType | null): string {
  return getAuthConfirmFailurePathForNext(type, null);
}

export function getAuthConfirmFailurePathForNext(
  type: EmailOtpType | null,
  safeNextPath: string | null,
): string {
  if (type === "recovery" && isAccountSetupRecoveryNextPath(safeNextPath)) {
    return appendSearchParams("/login", { error: "setup-link" });
  }

  if (type === "recovery") {
    return getPasswordResetInvalidLinkPath();
  }

  if (type === "invite") {
    return appendSearchParams("/login", { error: "setup-link" });
  }

  return appendSearchParams("/login", { error: "confirmation" });
}

export function isAccountSetupRecoveryNextPath(path: string | null): boolean {
  return getAccountSetupRecoveryNonce(path) !== null;
}

export function getAccountSetupRecoveryNonce(path: string | null): string | null {
  if (!path) {
    return null;
  }

  try {
    const url = new URL(path, "http://internal.local");
    const nonce = url.searchParams.get("setup_nonce")?.trim() ?? "";
    if (
      url.origin !== "http://internal.local" ||
      url.pathname !== UPDATE_PASSWORD_PATH ||
      url.searchParams.get("invite") !== "1" ||
      !UUID_PATTERN.test(nonce)
    ) {
      return null;
    }
    return nonce;
  } catch {
    return null;
  }
}

export function getPasswordUpdateRedirectPath(
  isRecovery: boolean,
  isInvite = false,
): string {
  if (isRecovery) {
    return appendSearchParams("/login", { message: "password-updated" });
  }

  if (isInvite) {
    return "/home";
  }

  return appendSearchParams("/account", { message: "password-updated" });
}

/** Neutral success path regardless of whether the email is registered. */
export function getPasswordResetRequestSuccessPath(): string {
  return appendSearchParams(FORGOT_PASSWORD_PATH, { message: "reset-sent" });
}

export function getPasswordResetRequestErrorPath(code: "invalid-email" | "temporary"): string {
  return appendSearchParams(FORGOT_PASSWORD_PATH, { error: code });
}

export function getPasswordUpdateErrorPath(
  isRecovery: boolean,
  code: "invalid" | "policy" | "mismatch" | "update" | "setup",
  isInvite = false,
): string {
  const basePath =
    isRecovery
      ? appendSearchParams(UPDATE_PASSWORD_PATH, { recovery: "1" })
      : isInvite
        ? appendSearchParams(UPDATE_PASSWORD_PATH, { invite: "1" })
        : UPDATE_PASSWORD_PATH;

  return appendSearchParams(basePath, { error: code });
}

export function resolveSafeAuthConfirmNextPath(
  nextParam: string | null,
  origin: string,
): string | null {
  const trimmed = nextParam?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, origin)
      : new URL(trimmed);

    if (url.origin !== new URL(origin).origin) {
      return null;
    }

    if (url.pathname === "/auth/confirm" || url.pathname.startsWith("/auth/confirm/")) {
      return null;
    }

    if (url.pathname.includes("..")) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
