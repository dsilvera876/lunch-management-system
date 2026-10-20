import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getSupportSessionIdentity,
  isSupportSessionIdentity,
  supportSessionIdentityKey,
  supportSessionMatchesIdentity,
  type ActiveSupportSession,
} from "./support-mode";

const activeSession: ActiveSupportSession = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  scope: "hr",
  reason: "Support ticket 42",
  startedAt: "2026-10-19T12:00:00.000Z",
  expiresAt: "2026-10-19T12:30:00.000Z",
};

describe("Support Mode expiration reconciliation", () => {
  it("uses the immutable UUID, scope, start, and expiry as the expected session identity", () => {
    const identity = getSupportSessionIdentity(activeSession);

    assert.deepEqual(identity, {
      id: activeSession.id,
      scope: "hr",
      startedAt: activeSession.startedAt,
      expiresAt: activeSession.expiresAt,
    });
    assert.equal(isSupportSessionIdentity(identity), true);
    assert.match(supportSessionIdentityKey(identity), /12:30:00\.000Z$/);
  });

  it("does not mistake a newer or authoritatively extended session for the stale tab's session", () => {
    const expected = getSupportSessionIdentity(activeSession);

    assert.equal(supportSessionMatchesIdentity(activeSession, expected), true);
    assert.equal(
      supportSessionMatchesIdentity(
        { ...activeSession, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        expected,
      ),
      false,
    );
    assert.equal(
      supportSessionMatchesIdentity(
        { ...activeSession, startedAt: "2026-10-19T12:05:00.000Z" },
        expected,
      ),
      false,
    );
    assert.equal(
      supportSessionMatchesIdentity(
        { ...activeSession, expiresAt: "2026-10-19T12:35:00.000Z" },
        expected,
      ),
      false,
    );
  });

  it("rejects malformed client-supplied reconciliation identities", () => {
    assert.equal(isSupportSessionIdentity(null), false);
    assert.equal(
      isSupportSessionIdentity({
        id: activeSession.id,
        scope: "staff",
        startedAt: activeSession.startedAt,
        expiresAt: activeSession.expiresAt,
      }),
      false,
    );
    assert.equal(
      isSupportSessionIdentity({
        id: activeSession.id,
        scope: "hr",
        startedAt: activeSession.expiresAt,
        expiresAt: activeSession.startedAt,
      }),
      false,
    );
  });

  it("centralizes expiration, navigation, focus, visibility, and pageshow checks in the provider", () => {
    const provider = readFileSync(
      new URL("../components/app-shell/support-mode-context.tsx", import.meta.url),
      "utf8",
    );

    assert.match(provider, /getSupportSessionRemainingMs/);
    assert.match(provider, /usePathname/);
    assert.match(provider, /addEventListener\("focus"/);
    assert.match(provider, /addEventListener\("visibilitychange"/);
    assert.match(provider, /addEventListener\("pageshow"/);
    assert.match(provider, /data-support-mode-expiration-gate/);
    assert.match(provider, /window\.location\.replace\("\/admin\/support"\)/);
  });

  it("uses an identity-bound read-only action and never automatically ends a session", () => {
    const actions = readFileSync(
      new URL("../app/admin/support/actions.ts", import.meta.url),
      "utf8",
    );
    const reconciliation = actions.slice(
      actions.indexOf("export async function reconcileSupportSessionAction"),
    );

    assert.match(reconciliation, /requireAdminOrOwner/);
    assert.match(reconciliation, /get_support_session_status/);
    assert.match(reconciliation, /supportSessionMatchesIdentity/);
    assert.doesNotMatch(reconciliation, /end_support_session/);
    assert.doesNotMatch(reconciliation, /start_support_session/);
  });

  it("binds manual Start and Exit actions to the displayed session UUID", () => {
    const actions = readFileSync(
      new URL("../app/admin/support/actions.ts", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/support-mode-workspace.tsx", import.meta.url),
      "utf8",
    );
    const banner = readFileSync(
      new URL("../components/app-shell/support-mode-banner.tsx", import.meta.url),
      "utf8",
    );
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20261019120000_support_mode_identity_bound_mutations.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(actions, /p_expected_session_id/);
    assert.match(workspace, /expectedSessionId/);
    assert.match(workspace, /endSupportSessionAction\(activeSession\.id\)/);
    assert.match(banner, /const displayedSessionId = session\.id/);
    assert.match(banner, /endSupportSessionAction\(displayedSessionId\)/);
    assert.match(migration, /for update/);
    assert.match(migration, /is distinct from p_expected_session_id/);
    assert.match(migration, /drop function if exists public\.end_support_session\(\)/);
    assert.match(
      migration,
      /drop function if exists public\.start_support_session\(text, text\)/,
    );
  });

  it("keeps the shell hidden on reconciliation errors and coalesces overlapping checks", () => {
    const provider = readFileSync(
      new URL("../components/app-shell/support-mode-context.tsx", import.meta.url),
      "utf8",
    );

    assert.match(provider, /\.catch\(\(\) => \{/);
    assert.match(provider, /setAccessHidden\(true\)/);
    assert.match(provider, /inFlightRef\.current/);
    assert.match(provider, /reconcilePendingRef\.current/);
  });
});
