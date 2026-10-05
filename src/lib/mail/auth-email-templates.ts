import { appendSearchParams } from "@/lib/redirect-url";
import { UPDATE_PASSWORD_PATH } from "@/lib/auth-recovery";
import { getApplicationOrigin } from "@/lib/request-origin";

export type AuthEmailActionType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email"
  | "reauthentication"
  | string;

export type AuthEmailTemplateInput = {
  actionType: AuthEmailActionType;
  confirmUrl: string;
  otpCode?: string;
};

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your Lunch Management System account",
  invite: "Complete your Lunch Management System account setup",
  magiclink: "Your Lunch Management System sign-in link",
  recovery: "Reset your Lunch Management System password",
  email_change: "Confirm your email change",
  reauthentication: "Your verification code",
};

export function mapAuthEmailOtpType(actionType: AuthEmailActionType): string {
  switch (actionType) {
    case "invite":
      return "invite";
    case "magiclink":
      return "magiclink";
    case "recovery":
      return "recovery";
    case "email_change":
      return "email_change";
    case "email":
      return "email";
    case "signup":
    default:
      return "signup";
  }
}

function tryParseInternalPath(redirectTo: string | undefined, origin: string): string | null {
  const trimmed = redirectTo?.trim();
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

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function resolveAuthConfirmNextPath(input: {
  actionType: AuthEmailActionType;
  redirectTo?: string;
  applicationOrigin?: string;
}): string {
  const origin = input.applicationOrigin ?? getApplicationOrigin();
  const fromRedirect = tryParseInternalPath(input.redirectTo, origin);
  if (fromRedirect) {
    return fromRedirect;
  }

  switch (input.actionType) {
    case "invite":
      return appendSearchParams(UPDATE_PASSWORD_PATH, { invite: "1" });
    case "recovery":
      return appendSearchParams(UPDATE_PASSWORD_PATH, { recovery: "1" });
    case "signup":
    case "email":
    case "magiclink":
    default:
      return "/home";
  }
}

export function buildAuthConfirmUrl(input: {
  tokenHash: string;
  actionType: AuthEmailActionType;
  redirectTo?: string;
  applicationOrigin?: string;
}): string {
  const origin = input.applicationOrigin ?? getApplicationOrigin();
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", input.tokenHash);
  url.searchParams.set("type", mapAuthEmailOtpType(input.actionType));
  url.searchParams.set(
    "next",
    resolveAuthConfirmNextPath({
      actionType: input.actionType,
      redirectTo: input.redirectTo,
      applicationOrigin: origin,
    }),
  );
  return url.toString();
}

export function isDirectSupabaseVerifyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname.includes("/auth/v1/verify");
  } catch {
    return false;
  }
}

export const RECOVERY_EMAIL_EXPIRY_COPY =
  "This link expires in about one hour. If it expires, request a new password reset from the sign-in page.";

export function buildAuthEmailContent(input: AuthEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = SUBJECTS[input.actionType] ?? "Lunch Management System notification";
  const isRecovery = input.actionType === "recovery";
  const otpLine =
    input.otpCode && input.actionType === "reauthentication"
      ? `\nYour verification code: ${input.otpCode}\n`
      : "";

  const text = [
    "Hello,",
    "",
    isRecovery
      ? "Use the link below to reset your password:"
      : "Use the link below to continue:",
    input.confirmUrl,
    isRecovery ? RECOVERY_EMAIL_EXPIRY_COPY : null,
    otpLine,
    "",
    "If you did not request this email, you can ignore it.",
  ]
    .filter(Boolean)
    .join("\n");

  const safeUrl = input.confirmUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const html = [
    "<p>Hello,</p>",
    isRecovery
      ? "<p>Use the link below to reset your password:</p>"
      : "<p>Use the link below to continue:</p>",
    `<p><a href="${safeUrl}">Open Lunch Management System</a></p>`,
    isRecovery ? `<p>${RECOVERY_EMAIL_EXPIRY_COPY}</p>` : "",
    input.otpCode && input.actionType === "reauthentication"
      ? `<p>Your verification code: <strong>${input.otpCode}</strong></p>`
      : "",
    "<p>If you did not request this email, you can ignore it.</p>",
  ]
    .filter(Boolean)
    .join("");

  return { subject, text, html };
}
