export type SignupPath = "company" | "external";

export type ClassifySignupEmailResult =
  | { ok: true; path: SignupPath }
  | { ok: false; code: "invalid_email" };

export type RequestExternalSignupResult =
  | { ok: true; code: "submitted" | "already_pending" | "already_approved" }
  | { ok: false; code: "invalid_name" | "invalid_email" | "company_email" | "unavailable"; message?: string };

export function parseClassifySignupEmailResult(raw: unknown): ClassifySignupEmailResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_email" };
  }

  const record = raw as Record<string, unknown>;

  if (record.ok !== true) {
    return { ok: false, code: "invalid_email" };
  }

  if (record.path === "company" || record.path === "external") {
    return { ok: true, path: record.path };
  }

  return { ok: false, code: "invalid_email" };
}

export function parseRequestExternalSignupResult(raw: unknown): RequestExternalSignupResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_email" };
  }

  const record = raw as Record<string, unknown>;

  if (record.ok === true) {
    const code = record.code;
    if (code === "submitted" || code === "already_pending" || code === "already_approved") {
      return { ok: true, code };
    }
  }

  if (record.ok === false) {
    const code = record.code;
    if (
      code === "invalid_name" ||
      code === "invalid_email" ||
      code === "company_email" ||
      code === "unavailable"
    ) {
      return {
        ok: false,
        code,
        message: typeof record.message === "string" ? record.message : undefined,
      };
    }
  }

  return { ok: false, code: "invalid_email" };
}

export const EXTERNAL_SIGNUP_SUCCESS_TITLE = "Request submitted";

export const EXTERNAL_SIGNUP_SUCCESS_BODY =
  "Your email address requires HR approval before you can access the Lunch Management System. If your request is approved, you will receive an email with instructions to complete your account setup.";

export const COMPANY_SIGNUP_CHECK_EMAIL_TITLE = "Check your email";

export const COMPANY_SIGNUP_CHECK_EMAIL_BODY =
  "We sent a confirmation link to your email address. Confirm your email before signing in.";
