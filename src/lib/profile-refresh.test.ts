import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseCurrentRoleResponse,
  shouldCheckRoleOnNavigation,
  shouldRefreshProfileForRole,
} from "./profile-refresh";

describe("shouldCheckRoleOnNavigation", () => {
  it("does not check on initial mount", () => {
    assert.equal(shouldCheckRoleOnNavigation(null, "/home"), false);
  });

  it("checks when pathname changes after mount", () => {
    assert.equal(shouldCheckRoleOnNavigation("/home", "/admin"), true);
  });

  it("does not check when pathname is unchanged", () => {
    assert.equal(shouldCheckRoleOnNavigation("/home", "/home"), false);
  });
});

describe("shouldRefreshProfileForRole", () => {
  it("does not refresh when roles match", () => {
    assert.equal(shouldRefreshProfileForRole("staff", "staff"), false);
    assert.equal(shouldRefreshProfileForRole("admin", "admin"), false);
  });

  it("refreshes when roles differ", () => {
    assert.equal(shouldRefreshProfileForRole("admin", "staff"), true);
    assert.equal(shouldRefreshProfileForRole("staff", "hr"), true);
  });

  it("detects Staff to HR", () => {
    assert.equal(shouldRefreshProfileForRole("staff", "hr"), true);
  });

  it("detects Admin to Staff", () => {
    assert.equal(shouldRefreshProfileForRole("admin", "staff"), true);
  });

  it("detects Owner to Admin after ownership transfer", () => {
    assert.equal(shouldRefreshProfileForRole("owner", "admin"), true);
  });

  it("detects target user becoming Owner", () => {
    assert.equal(shouldRefreshProfileForRole("admin", "owner"), true);
  });

  it("does not refresh when role lookup is unavailable", () => {
    assert.equal(shouldRefreshProfileForRole("admin", null), false);
  });

  it("does not refresh in a loop once roles match again", () => {
    assert.equal(shouldRefreshProfileForRole("staff", "staff"), false);
  });
});

describe("parseCurrentRoleResponse", () => {
  it("parses a valid role payload", () => {
    assert.equal(parseCurrentRoleResponse({ role: "hr" }), "hr");
  });

  it("returns null for unauthenticated or malformed payloads", () => {
    assert.equal(parseCurrentRoleResponse({ error: "Unauthorized" }), null);
    assert.equal(parseCurrentRoleResponse(null), null);
    assert.equal(parseCurrentRoleResponse({ role: 1 }), null);
  });
});

describe("authorization remains server-side", () => {
  it("never treats a stale rendered role as authoritative over the server", () => {
    assert.equal(shouldRefreshProfileForRole("admin", "staff"), true);
    assert.equal(shouldRefreshProfileForRole("owner", "admin"), true);
  });
});
