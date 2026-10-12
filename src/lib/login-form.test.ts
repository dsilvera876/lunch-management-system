import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LOGIN_ERROR_MESSAGES,
  failedLoginState,
  initialLoginFormState,
  isLoginErrorCode,
} from "./login-form";

function readApp(path: string): string {
  return readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
}

function readComponent(path: string): string {
  return readFileSync(new URL(`../components/${path}`, import.meta.url), "utf8");
}

describe("login form state", () => {
  it("accepts only known error codes from the URL", () => {
    assert.equal(isLoginErrorCode("credentials"), true);
    assert.equal(isLoginErrorCode("unconfirmed"), true);
    assert.equal(isLoginErrorCode("setup-link"), false);
    assert.equal(isLoginErrorCode(undefined), false);
    assert.deepEqual(initialLoginFormState("credentials"), {
      error: "credentials",
      email: "",
      attempt: 0,
    });
    assert.deepEqual(initialLoginFormState("<script>"), { error: null, email: "", attempt: 0 });
  });

  it("keeps the trimmed email and bumps the attempt on each failure", () => {
    const first = failedLoginState(initialLoginFormState(undefined), "credentials", "  a@b.test ");
    assert.deepEqual(first, { error: "credentials", email: "a@b.test", attempt: 1 });
    const second = failedLoginState(first, "credentials", "a@b.test");
    assert.equal(second.attempt, 2);
  });

  it("never stores non-string or oversized email values", () => {
    assert.equal(failedLoginState(initialLoginFormState(undefined), "invalid", null).email, "");
    const long = "x".repeat(1000);
    assert.equal(failedLoginState(initialLoginFormState(undefined), "invalid", long).email.length, 320);
  });

  it("keeps the existing error copy", () => {
    assert.equal(LOGIN_ERROR_MESSAGES.credentials, "Unable to sign in. Check your email and password.");
  });
});

describe("login action", () => {
  const source = readApp("login/actions.ts");

  it("returns form state instead of redirecting failures through the URL", () => {
    assert.doesNotMatch(source, /\/login\?error=/);
    assert.doesNotMatch(source, /email=\$\{|encodeURIComponent\(email/);
    assert.match(source, /failedLoginState\(previousState, "credentials", email\)/);
  });

  it("never echoes the password back to the client", () => {
    assert.doesNotMatch(source, /failedLoginState\([^)]*password/);
  });

  it("keeps the post-login gate on success", () => {
    assert.match(source, /gateApplicationProfileAfterAuth/);
    assert.match(source, /redirect\(getPostLoginPath\(gate\.role\)\)/);
  });
});

describe("login form accessibility", () => {
  const form = readApp("login/login-form.tsx");
  const layout = readComponent("auth/login-page-layout.tsx");

  it("associates the error with both fields and focuses it after a failed attempt", () => {
    assert.match(form, /aria-describedby=\{describedBy\}[\s\S]*aria-describedby=\{describedBy\}/);
    assert.match(form, /aria-invalid=\{errorMessage \? true : undefined\}/);
    assert.match(form, /state\.attempt > 0 && state\.error[\s\S]*errorRef\.current\?\.focus\(\)/);
    assert.match(form, /liveRegion=\{state\.attempt === 0\}/);
  });

  it("restores the email but not the password", () => {
    assert.match(form, /defaultValue=\{state\.email\}/);
    assert.doesNotMatch(form, /defaultValue=\{state\.password/);
  });

  it("shows pending progress and keeps the submit focusable while blocking duplicates", () => {
    assert.match(form, /pendingText="Signing in…"/);
    assert.match(form, /focusableWhilePending/);
    assert.match(form, /staffPrimaryCta/);
  });

  it("uses a main landmark and accessible contrast tokens", () => {
    assert.match(layout, /<main\b/);
    assert.match(form, /text-staff-teal/);
    assert.match(form, /Show typed characters|Hide typed characters/);
    assert.doesNotMatch(form, /text-primary/);
  });
});
