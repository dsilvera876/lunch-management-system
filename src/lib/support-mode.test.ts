import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getNavForRole, canAccessRoute } from "./navigation";
import {
  canViewAccountsOperationalData,
  canViewHrOperationalData,
} from "./roles";
import {
  formatSupportSessionStartError,
  mapSupportSessionFromRpcData,
  mapSupportSessionRow,
  parseSupportSessionRpcData,
  supportScopeLandingPath,
} from "./support-mode";

describe("support mode application wiring", () => {
  it("shows Primary + ADMIN for Admin without support", () => {
    const labels = getNavForRole("admin")
      .map((group) => group.label)
      .filter((label): label is string => label !== null);
    assert.deepEqual(labels, ["ADMIN"]);
  });

  it("shows HR TOOLS + ADMIN when HR support is active", () => {
    const labels = getNavForRole("admin", "hr")
      .map((group) => group.label)
      .filter((label): label is string => label !== null);
    assert.deepEqual(labels, ["HR TOOLS", "ADMIN"]);
  });

  it("shows ACCOUNTS + ADMIN when Accounts support is active", () => {
    const labels = getNavForRole("admin", "accounts")
      .map((group) => group.label)
      .filter((label): label is string => label !== null);
    assert.deepEqual(labels, ["ACCOUNTS", "ADMIN"]);
  });

  it("does not show HR and ACCOUNTS support sections together", () => {
    const hrLabels = getNavForRole("admin", "hr")
      .map((group) => group.label)
      .filter(Boolean);
    assert.ok(!hrLabels.includes("ACCOUNTS"));
    const accountsLabels = getNavForRole("admin", "accounts")
      .map((group) => group.label)
      .filter(Boolean);
    assert.ok(!accountsLabels.includes("HR TOOLS"));
  });

  it("extends route access only for matching support scope", () => {
    assert.equal(canAccessRoute("admin", "/admin/deliveries"), false);
    assert.equal(canAccessRoute("admin", "/admin/deliveries", "hr"), true);
    assert.equal(canAccessRoute("admin", "/admin/deliveries", "accounts"), false);
    assert.equal(canAccessRoute("admin", "/admin/lunch-periods", "accounts"), true);
    assert.equal(canAccessRoute("admin", "/admin/lunch-periods", "hr"), false);
  });

  it("keeps governance routes without cross-scope leakage", () => {
    assert.equal(canAccessRoute("admin", "/admin/users", "hr"), true);
    assert.equal(canAccessRoute("admin", "/admin/users/import", "hr"), false);
    assert.ok(canViewHrOperationalData("admin", "hr"));
    assert.ok(!canViewAccountsOperationalData("admin", "hr"));
  });

  it("wires banner and support entry UI", () => {
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );
    const supportPage = readFileSync(
      new URL("../app/admin/support/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(shell, /SupportModeBanner/);
    assert.match(supportPage, /SupportModeWorkspace/);
  });

  it("gates HR operational mutation controls during support", () => {
    const filesWithHint = [
      "../components/admin/lunch-providers/manage-menu-workspace.tsx",
      "../components/admin/office-locations-workspace.tsx",
      "../components/admin/late-orders-workspace.tsx",
      "../components/admin/deliveries-workspace.tsx",
      "../components/admin/delivery-issue-panel.tsx",
    ] as const;

    for (const relativePath of filesWithHint) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      assert.match(source, /useSupportMode/);
      assert.ok(
        source.includes("SupportModeMutationHint") ||
          source.includes("SUPPORT_MODE_DISABLED_HINT"),
      );
    }

    const statusCard = readFileSync(
      new URL(
        "../components/admin/late-orders/late-order-provider-status-card.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(statusCard, /useSupportMode/);
    assert.match(statusCard, /readOnly \? null/);
  });

  it("gates Accounts support mutation surfaces", () => {
    const lunchPeriodsPage = readFileSync(
      new URL("../app/admin/lunch-periods/page.tsx", import.meta.url),
      "utf8",
    );
    const financialsPage = readFileSync(
      new URL("../app/admin/financials/page.tsx", import.meta.url),
      "utf8",
    );
    const employeeIds = readFileSync(
      new URL("../components/admin/employee-id-management-workspace.tsx", import.meta.url),
      "utf8",
    );
    const lunchTable = readFileSync(
      new URL("../components/admin/lunch-periods/lunch-periods-table.tsx", import.meta.url),
      "utf8",
    );

    assert.match(lunchPeriodsPage, /readOnly=\{supportReadOnly\}/);
    assert.match(financialsPage, /supportReadOnly=\{supportReadOnly\}/);
    assert.match(employeeIds, /SupportModeMutationHint/);
    assert.match(lunchTable, /readOnly\?: boolean/);
  });

  it("maps RPC payloads and landing paths for support activation", () => {
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const row = {
      scope: "hr",
      reason: "ticket 42",
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    assert.deepEqual(parseSupportSessionRpcData([row]), row);
    assert.deepEqual(parseSupportSessionRpcData(row), row);
    assert.equal(parseSupportSessionRpcData([]), null);

    const session = mapSupportSessionFromRpcData([row]);
    assert.equal(session?.scope, "hr");
    assert.equal(supportScopeLandingPath("hr"), "/admin/todays-orders");
    assert.equal(supportScopeLandingPath("accounts"), "/admin/lunch-periods");
  });

  it("humanizes support start errors for the modal", () => {
    assert.match(
      formatSupportSessionStartError("Support reason is required"),
      /reason is required/i,
    );
    assert.match(
      formatSupportSessionStartError("Admin or Owner required"),
      /Admin or Owner/i,
    );
  });

  it("keeps support status SQL helpers read-only in migrations", () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260930150000_support_mode_readonly_status_helpers.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const readOnlySection = migration.slice(
      migration.indexOf("create or replace function private.active_support_scope"),
    );
    assert.doesNotMatch(readOnlySection, /expire_stale_support_sessions/);
    assert.doesNotMatch(
      migration.slice(migration.indexOf("get_support_session_status")),
      /expire_stale_support_sessions/,
    );
    assert.match(migration, /expires_at > now\(\)/);
  });

  it("redirects after successful support start and surfaces RPC failures", () => {
    const actions = readFileSync(
      new URL("../app/admin/support/actions.ts", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/support-mode-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(actions, /get_support_session_status|fetchActiveSupportSession/);
    assert.match(actions, /redirect\(supportScopeLandingPath\(scope\)\)/);
    assert.match(actions, /formatSupportSessionStartError/);
    assert.match(workspace, /setError\(result\.error\)/);
    assert.doesNotMatch(workspace, /router\.refresh\(\)/);
  });

  it("forces dynamic layout and remounts support provider on session change", () => {
    const layout = readFileSync(
      new URL("../app/layout.tsx", import.meta.url),
      "utf8",
    );
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );

    assert.match(layout, /force-dynamic/);
    assert.match(shell, /supportProviderKey/);
  });

  it("drops expired support sessions from client mapping", () => {
    const expired = mapSupportSessionRow({
      scope: "hr",
      reason: "test",
      started_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: new Date(Date.now() - 30_000).toISOString(),
    });
    assert.equal(expired, null);
  });
});
