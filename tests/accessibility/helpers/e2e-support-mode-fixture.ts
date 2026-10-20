import { runLocalDbExec, runLocalDbQuery } from "./e2e-local-db";

type SupportSessionState = {
  id: string;
  scope: "hr" | "accounts";
  reason: string;
  expired: boolean;
  endedAt: string | null;
  endedReason: string | null;
};

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function requireLoopbackUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[support-mode fixture] ${label} must be a valid loopback URL.`);
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`[support-mode fixture] Refusing non-local ${label}.`);
  }
}

export function assertLocalSupportModeFixture(): void {
  requireLoopbackUrl(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    "Playwright base URL",
  );
  requireLoopbackUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    "Supabase URL",
  );
}

export function closeActiveSupportModeFixtureSession(email: string): void {
  assertLocalSupportModeFixture();
  const normalizedEmail = email.trim().toLowerCase();
  runLocalDbExec(`
    update private.support_sessions ss
    set ended_at = now(), ended_reason = coalesce(ss.ended_reason, 'manual')
    from auth.users au
    where au.id = ss.actor_profile_id
      and lower(btrim(au.email::text)) = ${sqlLiteral(normalizedEmail)}
      and ss.ended_at is null
    returning ss.id;
  `);
}

export function shortenActiveSupportModeFixtureSession(
  email: string,
  seconds: number,
): void {
  assertLocalSupportModeFixture();
  const normalizedEmail = email.trim().toLowerCase();
  const safeSeconds = Math.max(1, Math.min(60, Math.trunc(seconds)));
  const rows = runLocalDbQuery(`
    update private.support_sessions ss
    set expires_at = clock_timestamp() + make_interval(secs => ${safeSeconds})
    from auth.users au
    where au.id = ss.actor_profile_id
      and lower(btrim(au.email::text)) = ${sqlLiteral(normalizedEmail)}
      and ss.ended_at is null
      and ss.expires_at > now()
    returning ss.id::text as session_id;
  `);

  if (rows.length !== 1) {
    throw new Error(
      `[support-mode fixture] Expected one active session to shorten; found ${rows.length}.`,
    );
  }
}

export function expireActiveSupportModeFixtureSession(email: string): void {
  assertLocalSupportModeFixture();
  const normalizedEmail = email.trim().toLowerCase();
  const rows = runLocalDbQuery(`
    update private.support_sessions ss
    set expires_at = clock_timestamp() - interval '1 second'
    from auth.users au
    where au.id = ss.actor_profile_id
      and lower(btrim(au.email::text)) = ${sqlLiteral(normalizedEmail)}
      and ss.ended_at is null
      and ss.expires_at > now()
    returning ss.id::text as session_id;
  `);

  if (rows.length !== 1) {
    throw new Error(
      `[support-mode fixture] Expected one active session to expire; found ${rows.length}.`,
    );
  }
}

export function replaceActiveSupportModeFixtureSession(
  email: string,
  scope: "hr" | "accounts",
): string {
  assertLocalSupportModeFixture();
  const normalizedEmail = email.trim().toLowerCase();
  const rows = runLocalDbQuery(`
    with actor as (
      select p.id, p.role
      from public.profiles p
      inner join auth.users au on au.id = p.id
      where lower(btrim(au.email::text)) = ${sqlLiteral(normalizedEmail)}
        and p.account_status = 'active'
        and p.role in ('admin', 'owner')
    ), ended as (
      update private.support_sessions ss
      set ended_at = now(), ended_reason = 'replaced'
      from actor a
      where ss.actor_profile_id = a.id
        and ss.ended_at is null
      returning ss.id
    ), inserted as (
      insert into private.support_sessions (
        actor_profile_id,
        actor_role,
        scope,
        reason,
        expires_at
      )
      select
        a.id,
        a.role,
        ${sqlLiteral(scope)},
        'E2E stale-tab replacement',
        now() + interval '30 minutes'
      from actor a
      returning id
    )
    select id::text as session_id from inserted;
  `);

  if (rows.length !== 1) {
    throw new Error(
      `[support-mode fixture] Expected one replacement session; created ${rows.length}.`,
    );
  }

  return String(rows[0].session_id);
}

export function getLatestSupportModeFixtureSession(
  email: string,
): SupportSessionState | null {
  assertLocalSupportModeFixture();
  const normalizedEmail = email.trim().toLowerCase();
  const rows = runLocalDbQuery(`
    select
      ss.id::text as session_id,
      ss.scope,
      ss.reason,
      ss.expires_at <= now() as expired,
      ss.ended_at::text as ended_at,
      ss.ended_reason
    from private.support_sessions ss
    inner join auth.users au on au.id = ss.actor_profile_id
    where lower(btrim(au.email::text)) = ${sqlLiteral(normalizedEmail)}
    order by ss.started_at desc
    limit 1;
  `);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.session_id),
    scope: row.scope as SupportSessionState["scope"],
    reason: String(row.reason),
    expired: row.expired === true,
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    endedReason: typeof row.ended_reason === "string" ? row.ended_reason : null,
  };
}

export function getSupportModeFixtureSessionById(
  email: string,
  sessionId: string,
): SupportSessionState | null {
  assertLocalSupportModeFixture();
  const normalizedEmail = email.trim().toLowerCase();
  const rows = runLocalDbQuery(`
    select
      ss.id::text as session_id,
      ss.scope,
      ss.reason,
      ss.expires_at <= now() as expired,
      ss.ended_at::text as ended_at,
      ss.ended_reason
    from private.support_sessions ss
    inner join auth.users au on au.id = ss.actor_profile_id
    where lower(btrim(au.email::text)) = ${sqlLiteral(normalizedEmail)}
      and ss.id = ${sqlLiteral(sessionId)}::uuid
    limit 1;
  `);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.session_id),
    scope: row.scope as SupportSessionState["scope"],
    reason: String(row.reason),
    expired: row.expired === true,
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    endedReason: typeof row.ended_reason === "string" ? row.ended_reason : null,
  };
}
