import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  evaluatePostLoginProfile,
  getLoginInactivePath,
  getLoginIncompleteSetupPath,
  loginPathForPostLoginDeny,
} from "./post-login-gate";

describe("post-login profile gate", () => {
  it("allows active profiles with valid roles", () => {
    const result = evaluatePostLoginProfile(
      { role: "staff", account_status: "active", onboarding_pending: false },
      false,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.role, "staff");
    }
  });

  it("denies inactive accounts", () => {
    const result = evaluatePostLoginProfile(
      { role: "staff", account_status: "inactive", onboarding_pending: false },
      false,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "inactive");
    }
  });

  it("denies missing profiles without defaulting to staff", () => {
    const missing = evaluatePostLoginProfile(null, true);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.reason, "missing_profile");
    }

    const notFound = evaluatePostLoginProfile(null, false);
    assert.equal(notFound.ok, false);
  });

  it("denies invalid roles", () => {
    const result = evaluatePostLoginProfile(
      { role: "superuser", account_status: "active", onboarding_pending: false },
      false,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_role");
    }
  });

  it("denies active external accounts while linked onboarding is incomplete", () => {
    const result = evaluatePostLoginProfile(
      { role: "hr", account_status: "active", onboarding_pending: true },
      false,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "incomplete_onboarding");
      assert.equal(
        loginPathForPostLoginDeny(result.reason),
        getLoginIncompleteSetupPath(),
      );
    }
  });

  it("allows completed external and ordinary active HR accounts", () => {
    const completedExternal = evaluatePostLoginProfile(
      { role: "hr", account_status: "active", onboarding_pending: false },
      false,
    );
    const ordinaryHr = evaluatePostLoginProfile(
      { role: "hr", account_status: "active", onboarding_pending: false },
      false,
    );

    assert.deepEqual(completedExternal, { ok: true, role: "hr" });
    assert.deepEqual(ordinaryHr, { ok: true, role: "hr" });
  });

  it("maps deny reasons to login error paths", () => {
    assert.match(getLoginInactivePath(), /error=inactive/);
    assert.match(getLoginIncompleteSetupPath(), /error=incomplete-setup/);
    assert.equal(
      loginPathForPostLoginDeny("inactive"),
      getLoginInactivePath(),
    );
    assert.equal(
      loginPathForPostLoginDeny("missing_profile"),
      getLoginIncompleteSetupPath(),
    );
  });
});

describe("login action wiring", () => {
  it("uses post-login gate instead of staff fallback", () => {
    const actions = readFileSync(
      new URL("../app/login/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(actions, /gateApplicationProfileAfterAuth/);
    assert.doesNotMatch(actions, /"staff"/);
  });
});

describe("auth confirm post-login wiring", () => {
  it("uses post-login gate instead of staff fallback", () => {
    const route = readFileSync(
      new URL("../app/auth/confirm/route.ts", import.meta.url),
      "utf8",
    );
    const gate = readFileSync(new URL("./post-login-gate.ts", import.meta.url), "utf8");

    assert.match(route, /gateApplicationProfileAfterAuth/);
    assert.doesNotMatch(route, /"staff"/);
    assert.match(gate, /get_authenticated_profile_for_login/);
  });
});
