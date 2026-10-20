import { canManageRoles, type UserRole } from "@/lib/roles";

export const SUPPORT_SCOPES = ["hr", "accounts"] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];
export const SUPPORT_SESSION_STALE_NOTICE = "session-changed";
export const SUPPORT_SESSION_STALE_MESSAGE =
  "Support Mode changed in another tab. The current session has been preserved.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ActiveSupportSession = {
  id: string;
  scope: SupportScope;
  reason: string;
  startedAt: string;
  expiresAt: string;
};

export type SupportSessionIdentity = Pick<
  ActiveSupportSession,
  "id" | "scope" | "startedAt" | "expiresAt"
>;

export function isSupportScope(value: string): value is SupportScope {
  return (SUPPORT_SCOPES as readonly string[]).includes(value);
}

export function getSupportSessionIdentity(
  session: ActiveSupportSession,
): SupportSessionIdentity {
  return {
    id: session.id,
    scope: session.scope,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
  };
}

export function isSupportSessionIdentity(
  value: unknown,
): value is SupportSessionIdentity {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !UUID_PATTERN.test(record.id) ||
    typeof record.scope !== "string" ||
    !isSupportScope(record.scope) ||
    typeof record.startedAt !== "string" ||
    typeof record.expiresAt !== "string"
  ) {
    return false;
  }

  const startedAtMs = Date.parse(record.startedAt);
  const expiresAtMs = Date.parse(record.expiresAt);
  return (
    Number.isFinite(startedAtMs) &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > startedAtMs
  );
}

export function supportSessionIdentityKey(
  identity: SupportSessionIdentity,
): string {
  return `${identity.id}:${identity.scope}:${identity.startedAt}:${identity.expiresAt}`;
}

export function supportSessionMatchesIdentity(
  session: ActiveSupportSession,
  identity: SupportSessionIdentity,
): boolean {
  return (
    session.id === identity.id &&
    session.scope === identity.scope &&
    session.startedAt === identity.startedAt &&
    session.expiresAt === identity.expiresAt
  );
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
  session_id: string;
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
  const sessionId = record.session_id ?? record.id;
  const scope = record.scope;
  const reason = record.reason;
  const startedAt = record.started_at ?? record.startedAt;
  const expiresAt = record.expires_at ?? record.expiresAt;

  if (
    typeof sessionId !== "string" ||
    !UUID_PATTERN.test(sessionId) ||
    typeof scope !== "string" ||
    typeof reason !== "string"
  ) {
    return null;
  }
  if (typeof startedAt !== "string" || typeof expiresAt !== "string") {
    return null;
  }

  return {
    session_id: sessionId,
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
    id: row.session_id,
    scope: row.scope,
    reason: row.reason,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  };
}

export function mapSupportSessionFromRpcData(data: unknown): ActiveSupportSession | null {
  return mapSupportSessionRow(parseSupportSessionRpcData(data));
}

export type SupportSessionMutationOutcome = "started" | "ended" | "stale";

export function parseSupportSessionMutationOutcome(
  data: unknown,
): SupportSessionMutationOutcome | null {
  const value = Array.isArray(data) ? data[0] : data;

  if (value === "ended" || value === "stale") {
    return value;
  }

  if (value && typeof value === "object") {
    const outcome = (value as Record<string, unknown>).outcome;
    if (outcome === "started" || outcome === "stale") {
      return outcome;
    }
  }

  return null;
}

export function isSupportSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
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
