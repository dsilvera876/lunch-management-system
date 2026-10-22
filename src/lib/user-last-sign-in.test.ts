import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLastLoggedIn,
  readAuthoritativeLastSignInAt,
} from "./user-last-sign-in";

describe("user last successful sign-in presentation", () => {
  it("formats an authoritative timestamp in Jamaica local time", () => {
    assert.equal(
      formatLastLoggedIn("2026-10-21T18:15:00Z"),
      "Oct 21, 2026, 1:15 PM",
    );
  });

  it("uses Never only for an authoritative null value", () => {
    assert.equal(readAuthoritativeLastSignInAt({ last_sign_in_at: null }), null);
    assert.equal(formatLastLoggedIn(null), "Never");
  });

  it("rejects missing or invalid RPC fields instead of displaying Never", () => {
    assert.throws(
      () => readAuthoritativeLastSignInAt({}),
      /missing last_sign_in_at/,
    );
    assert.throws(
      () => readAuthoritativeLastSignInAt({ last_sign_in_at: "not-a-date" }),
      /invalid last_sign_in_at/,
    );
  });
});
