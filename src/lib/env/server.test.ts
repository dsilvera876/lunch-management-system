import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getAccountSetupRecoveryPurposeSecret,
  getSupabaseSecretKey,
  getSupabaseUrl,
} from "./server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("worker Supabase env", () => {
  it("requires SUPABASE_URL for the worker client", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    assert.throws(
      () => getSupabaseUrl(),
      /SUPABASE_URL is not configured/,
    );
  });

  it("requires SUPABASE_SECRET_KEY and does not read legacy service_role env", () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_example_value";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.equal(getSupabaseSecretKey(), "sb_secret_example_value");
  });

  it("accepts modern Secret keys without JWT formatting", () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_not_a_jwt";

    assert.equal(getSupabaseSecretKey(), "sb_secret_not_a_jwt");
    assert.doesNotMatch(getSupabaseSecretKey(), /^eyJ/);
  });

  it("fails fast when SUPABASE_SECRET_KEY is missing", () => {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.throws(
      () => getSupabaseSecretKey(),
      /SUPABASE_SECRET_KEY is not configured/,
    );
  });

  it("requires a server-only recovery-purpose secret with at least 32 bytes", () => {
    delete process.env.ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET;
    assert.throws(
      () => getAccountSetupRecoveryPurposeSecret(),
      /at least 32 bytes/,
    );

    process.env.ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET = "too-short";
    assert.throws(
      () => getAccountSetupRecoveryPurposeSecret(),
      /at least 32 bytes/,
    );

    process.env.ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET = "x".repeat(32);
    assert.equal(getAccountSetupRecoveryPurposeSecret(), "x".repeat(32));
  });
});
