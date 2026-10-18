import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSignedAccountSetupRecoveryRedirect,
  verifyAccountSetupRecoveryPurpose,
} from "./signup-recovery-purpose";

const SECRET = "purpose-secret-for-tests-is-at-least-32-bytes";
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const NONCE = "00000000-0000-4000-8000-000000000011";
const USER_ID = "00000000-0000-4000-8000-000000000012";
const EMAIL = "External.User@Gmail.com";
const ORIGIN = "https://lunch.example.test";

function signedRedirect(): string {
  return buildSignedAccountSetupRecoveryRedirect(
    {
      nonce: NONCE,
      recipientEmail: EMAIL,
      expectedAuthUserId: USER_ID,
      redirectTo: `${ORIGIN}/account/update-password?untrusted=1#fragment`,
    },
    { secret: SECRET, nowMs: NOW },
  );
}

function verify(redirectTo: string, overrides: Partial<{
  recipientEmail: string;
  expectedAuthUserId: string;
  applicationOrigin: string;
  nowMs: number;
}> = {}) {
  return verifyAccountSetupRecoveryPurpose(
    {
      recipientEmail: overrides.recipientEmail ?? EMAIL,
      expectedAuthUserId: overrides.expectedAuthUserId ?? USER_ID,
      redirectTo,
      applicationOrigin: overrides.applicationOrigin ?? ORIGIN,
    },
    { secret: SECRET, nowMs: overrides.nowMs ?? NOW },
  );
}

describe("account setup recovery purpose envelope", () => {
  it("binds a short-lived purpose to the nonce and normalized identity", () => {
    const redirect = signedRedirect();
    assert.deepEqual(verify(redirect, { recipientEmail: EMAIL.toLowerCase() }), { nonce: NONCE });

    const parsed = new URL(redirect);
    assert.equal(parsed.pathname, "/account/update-password");
    assert.equal(parsed.searchParams.get("invite"), "1");
    assert.equal(parsed.searchParams.get("setup_nonce"), NONCE);
    assert.equal(parsed.searchParams.has("untrusted"), false);
    assert.equal(parsed.hash, "");
    assert.doesNotMatch(redirect, /External\.User|000000000012|purpose-secret/);
  });

  it("rejects missing, malformed, invalid, expired, or noncanonical envelopes", () => {
    const base = new URL(signedRedirect());
    const variants: URL[] = [];

    for (const key of ["setup_signature", "setup_expires", "setup_nonce"] as const) {
      const value = new URL(base);
      value.searchParams.delete(key);
      variants.push(value);
    }
    const malformed = new URL(base);
    malformed.searchParams.set("setup_signature", "not-a-signature");
    variants.push(malformed);
    const invalid = new URL(base);
    invalid.searchParams.set("setup_signature", "A".repeat(43));
    variants.push(invalid);
    const extra = new URL(base);
    extra.searchParams.set("next", "/admin");
    variants.push(extra);
    const duplicate = new URL(base);
    duplicate.searchParams.append("setup_nonce", NONCE);
    variants.push(duplicate);
    const offOrigin = new URL(base);
    offOrigin.host = "attacker.example";
    variants.push(offOrigin);

    for (const variant of variants) {
      assert.equal(verify(variant.toString()), null);
    }
    assert.equal(verify(base.toString(), { nowMs: NOW + 11 * 60 * 1000 }), null);
  });

  it("rejects tampering with recipient, Auth identity, or nonce", () => {
    const redirect = signedRedirect();
    assert.equal(verify(redirect, { recipientEmail: "other@gmail.com" }), null);
    assert.equal(
      verify(redirect, { expectedAuthUserId: "00000000-0000-4000-8000-000000000099" }),
      null,
    );

    const tampered = new URL(redirect);
    tampered.searchParams.set("setup_nonce", "00000000-0000-4000-8000-000000000099");
    assert.equal(verify(tampered.toString()), null);
  });
});
