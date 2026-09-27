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
      return "signup";
    case "magiclink":
      return "magiclink";
    case "recovery":
      return "recovery";
    case "email_change":
      return "email_change";
    case "signup":
    default:
      return "signup";
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
  if (input.redirectTo?.trim()) {
    url.searchParams.set("redirect_to", input.redirectTo.trim());
  }
  return url.toString();
}

export function buildAuthEmailContent(input: AuthEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = SUBJECTS[input.actionType] ?? "Lunch Management System notification";
  const otpLine =
    input.otpCode && input.actionType === "reauthentication"
      ? `\nYour verification code: ${input.otpCode}\n`
      : "";

  const text = [
    "Hello,",
    "",
    "Use the link below to continue:",
    input.confirmUrl,
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
    "<p>Use the link below to continue:</p>",
    `<p><a href="${safeUrl}">Open Lunch Management System</a></p>`,
    input.otpCode && input.actionType === "reauthentication"
      ? `<p>Your verification code: <strong>${input.otpCode}</strong></p>`
      : "",
    "<p>If you did not request this email, you can ignore it.</p>",
  ]
    .filter(Boolean)
    .join("");

  return { subject, text, html };
}
