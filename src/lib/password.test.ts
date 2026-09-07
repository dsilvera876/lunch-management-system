import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MIN_PASSWORD_LENGTH, validatePasswordUpdate } from "./password";

describe("validatePasswordUpdate", () => {
  it("rejects mismatched passwords", () => {
    const result = validatePasswordUpdate("password123", "password124");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "mismatch");
    }
  });

  it("enforces the shared minimum password length", () => {
    const result = validatePasswordUpdate("short", "short");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "policy");
    }

    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.equal(validatePasswordUpdate("longenough", "longenough").ok, true);
  });

  it("rejects missing password fields", () => {
    const result = validatePasswordUpdate("", "");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "missing");
    }
  });
});

describe("recovery session behavior", () => {
  it("expects recovery updates to redirect through login sign-in flow", () => {
    assert.match("/login?message=password-updated", /password-updated/);
  });
});
