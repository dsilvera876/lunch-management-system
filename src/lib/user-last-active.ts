import { formatDeadline } from "@/lib/format";

export function readAuthoritativeLastActiveAt(
  raw: Record<string, unknown>,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(raw, "last_active_at")) {
    throw new Error("User directory response is missing last_active_at.");
  }

  const value = raw.last_active_at;
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error("User directory response has an invalid last_active_at.");
  }

  return value;
}

export function formatLastActive(value: string | null): string {
  return value === null ? "Not yet recorded" : formatDeadline(value);
}
