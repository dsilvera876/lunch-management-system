import { canManageRoles, type UserRole } from "@/lib/roles";

export const SUPPORT_SCOPES = ["hr", "accounts"] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export type ActiveSupportSession = {
  scope: SupportScope;
  reason: string;
  startedAt: string;
  expiresAt: string;
};

export function isSupportScope(value: string): value is SupportScope {
  return (SUPPORT_SCOPES as readonly string[]).includes(value);
}

export function supportScopeLabel(scope: SupportScope): string {
  return scope === "hr" ? "HR" : "Accounts";
}

/** Admin/Owner with an active audited support session (read-only). */
export function isSupportReadOnlyActor(
  role: UserRole,
  session: ActiveSupportSession | null,
): boolean {
  return canManageRoles(role) && session !== null;
}

export type SupportSessionRow = {
  scope: string;
  reason: string;
  started_at: string;
  expires_at: string;
};

export function supportScopeLandingPath(scope: SupportScope): string {
  return scope === "hr" ? "/admin/todays-orders" : "/admin/lunch-periods";
}

function normalizeSupportSessionRow(row: unknown): SupportSessionRow | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const scope = record.scope;
  const reason = record.reason;
  const startedAt = record.started_at ?? record.startedAt;
  const expiresAt = record.expires_at ?? record.expiresAt;

  if (typeof scope !== "string" || typeof reason !== "string") {
    return null;
  }
  if (typeof startedAt !== "string" || typeof expiresAt !== "string") {
    return null;
  }

  return {
    scope,
    reason,
    started_at: startedAt,
    expires_at: expiresAt,
  };
}

/** Normalize Supabase RPC payloads for support session status (array, object, or empty). */
export function parseSupportSessionRpcData(data: unknown): SupportSessionRow | null {
  if (data == null) {
    return null;
  }

  if (Array.isArray(data)) {
    return data.length > 0 ? normalizeSupportSessionRow(data[0]) : null;
  }

  return normalizeSupportSessionRow(data);
}

export function mapSupportSessionRow(row: SupportSessionRow | null | undefined): ActiveSupportSession | null {
  if (!row || !isSupportScope(row.scope)) {
    return null;
  }
  const expiresAtMs = Date.parse(row.expires_at);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    return null;
  }
  return {
    scope: row.scope,
    reason: row.reason,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  };
}

export function mapSupportSessionFromRpcData(data: unknown): ActiveSupportSession | null {
  return mapSupportSessionRow(parseSupportSessionRpcData(data));
}

const SUPPORT_START_ERROR_MESSAGES: Record<string, string> = {
  "Authentication required": "Sign in again to start Support Mode.",
  "Admin or Owner required": "Only Admin or Owner accounts can start Support Mode.",
  "Invalid support scope": "That support scope is not valid.",
  "Support reason is required": "A reason is required to start Support Mode.",
  "Support reason is too long": "Keep the reason under 500 characters.",
  "Active profile required": "Your account must be active to start Support Mode.",
};

export function formatSupportSessionStartError(message: string): string {
  const trimmed = message.trim();
  return (
    SUPPORT_START_ERROR_MESSAGES[trimmed] ??
    (trimmed || "Unable to start Support Mode.")
  );
}
