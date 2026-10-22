import { formatDeadline } from "@/lib/format";

export function readAuthoritativeLastSignInAt(
  raw: Record<string, unknown>,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(raw, "last_sign_in_at")) {
    throw new Error("User directory response is missing last_sign_in_at.");
  }

  const value = raw.last_sign_in_at;
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error("User directory response has an invalid last_sign_in_at.");
  }

  return value;
}

export function formatLastLoggedIn(value: string | null): string {
  return value === null ? "Never" : formatDeadline(value);
}
