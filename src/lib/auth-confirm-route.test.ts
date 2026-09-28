import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveSafeAuthConfirmNextPath } from "./auth-recovery";

describe("auth confirm route wiring", () => {
  it("passes token_hash and type to verifyOtp server-side", () => {
    const route = readFileSync(
      new URL("../app/auth/confirm/route.ts", import.meta.url),
      "utf8",
    );

    assert.match(route, /verifyOtp\(\{/);
    assert.match(route, /token_hash: tokenHash/);
    assert.match(route, /type,/);
    assert.doesNotMatch(route, /console\.(log|debug|info)/);
  });

  it("accepts safe internal next paths and rejects recursive confirm URLs", () => {
    const origin = "https://example.test";

    assert.equal(
      resolveSafeAuthConfirmNextPath("/account/update-password?invite=1", origin),
      "/account/update-password?invite=1",
    );

    assert.equal(
      resolveSafeAuthConfirmNextPath("/auth/confirm?type=invite", origin),
      null,
    );

    assert.equal(
      resolveSafeAuthConfirmNextPath("https://evil.example.test/home", origin),
      null,
    );
  });
});
