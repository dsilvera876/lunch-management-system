import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateWebPrivilegedEnv } from "./validate-web-privileged-env.mjs";

const validatorPath = fileURLToPath(
  new URL("./validate-web-privileged-env.mjs", import.meta.url),
);

const validBaseEnvironment = {
  SUPABASE_URL: "https://local-test.supabase.co",
  SUPABASE_SECRET_KEY: "test-server-only-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://local-test.supabase.co",
  ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET: randomBytes(32).toString("hex"),
};

function parseExampleEnvironment(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

describe("staging web privileged environment validation", () => {
  it("rejects the unmodified example configuration", async () => {
    const examplePath = fileURLToPath(
      new URL("./env/web-privileged.env.example", import.meta.url),
    );
    const example = parseExampleEnvironment(await readFile(examplePath, "utf8"));

    assert.throws(
      () =>
        validateWebPrivilegedEnv({
          ...example,
          NEXT_PUBLIC_SUPABASE_URL: example.SUPABASE_URL,
        }),
      /example placeholder/,
    );
  });

  it("rejects the previous predictable long placeholder", () => {
    assert.throws(
      () =>
        validateWebPrivilegedEnv({
          ...validBaseEnvironment,
          ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET:
            "replace_with_at_least_32_random_bytes",
        }),
      /example placeholder/,
    );
  });

  it("rejects missing, empty, and short purpose secrets", () => {
    const missing = { ...validBaseEnvironment };
    delete missing.ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET;

    assert.throws(
      () => validateWebPrivilegedEnv(missing),
      /missing ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET/,
    );
    assert.throws(
      () =>
        validateWebPrivilegedEnv({
          ...validBaseEnvironment,
          ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET: "   ",
        }),
      /missing ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET/,
    );
    assert.throws(
      () =>
        validateWebPrivilegedEnv({
          ...validBaseEnvironment,
          ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET: "too-short",
        }),
      /too short/,
    );
  });

  it("accepts a generated 32-byte random secret", () => {
    assert.doesNotThrow(() => validateWebPrivilegedEnv(validBaseEnvironment));
  });

  it("never includes a rejected secret in the validation error", () => {
    const rejectedSecret = "replace_with_a_cryptographically_random_secret";

    assert.throws(
      () =>
        validateWebPrivilegedEnv({
          ...validBaseEnvironment,
          ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET: rejectedSecret,
        }),
      (error) =>
        error instanceof Error &&
        !error.message.includes(rejectedSecret) &&
        /example placeholder/.test(error.message),
    );
  });

  it("does not print purpose secrets from the command-line validator", () => {
    const rejectedSecret = "replace_with_at_least_32_random_bytes";
    const rejectedResult = spawnSync(process.execPath, [validatorPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        ...validBaseEnvironment,
        ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET: rejectedSecret,
      },
    });

    assert.equal(rejectedResult.status, 1);
    assert.doesNotMatch(
      `${rejectedResult.stdout}${rejectedResult.stderr}`,
      new RegExp(rejectedSecret),
    );
    assert.match(rejectedResult.stderr, /example placeholder/);

    const validResult = spawnSync(process.execPath, [validatorPath], {
      encoding: "utf8",
      env: { ...process.env, ...validBaseEnvironment },
    });

    assert.equal(validResult.status, 0);
    assert.doesNotMatch(
      `${validResult.stdout}${validResult.stderr}`,
      new RegExp(validBaseEnvironment.ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET),
    );
    assert.match(validResult.stdout, /server-only web environment configured/);
  });
});
