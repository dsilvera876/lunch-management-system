import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FORGOT_PASSWORD_PATH,
  getAuthConfirmFailurePath,
  getAuthConfirmSuccessPath,
  getPasswordResetRedirectTo,
  getPasswordResetRequestSuccessPath,
  getPasswordUpdateRedirectPath,
  isValidEmail,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  UPDATE_PASSWORD_PATH,
} from "./auth-recovery";

describe("auth recovery helpers", () => {
  it("exposes the forgot password route for login navigation", () => {
    assert.equal(FORGOT_PASSWORD_PATH, "/forgot-password");
  });

  it("accepts syntactically valid email addresses", () => {
    assert.equal(isValidEmail("staff@example.com"), true);
  });

  it("rejects malformed email addresses", () => {
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail("missing@domain"), false);
  });

  it("uses the same neutral success path regardless of account existence", () => {
    assert.equal(
      getPasswordResetRequestSuccessPath(),
      "/forgot-password?message=reset-sent",
    );
    assert.match(PASSWORD_RESET_SUCCESS_MESSAGE, /If an account exists/i);
  });

  it("routes recovery confirmation to the password update page", () => {
    assert.equal(
      getAuthConfirmSuccessPath("recovery"),
      "/account/update-password?recovery=1",
    );
  });

  it("routes signup confirmation through post-login handling", () => {
    assert.equal(getAuthConfirmSuccessPath("email"), "post-login");
    assert.equal(getAuthConfirmSuccessPath("signup"), "post-login");
  });

  it("rejects missing token hash with login confirmation error", () => {
    assert.equal(getAuthConfirmFailurePath(null), "/login?error=confirmation");
  });

  it("routes invalid recovery tokens to the forgot password page", () => {
    assert.equal(
      getAuthConfirmFailurePath("recovery"),
      "/forgot-password?error=invalid-link",
    );
  });

  it("redirects successful recovery password updates to login", () => {
    assert.equal(
      getPasswordUpdateRedirectPath(true),
      "/login?message=password-updated",
    );
  });

  it("keeps signed-in password changes on the account page", () => {
    assert.equal(
      getPasswordUpdateRedirectPath(false),
      "/account?message=password-updated",
    );
  });

  it("builds reset redirect targets from the canonical origin", () => {
    assert.equal(
      getPasswordResetRedirectTo("https://lunch.example.com"),
      "https://lunch.example.com/auth/confirm?type=recovery",
    );
  });

  it("composes query strings with a single delimiter", () => {
    const url = getAuthConfirmSuccessPath("recovery");
    assert.equal((url.match(/\?/g) ?? []).length, 1);
    assert.equal(url.startsWith(UPDATE_PASSWORD_PATH), true);
  });
});

describe("password reset role safety", () => {
  it("does not expose profile or role mutation helpers in recovery utilities", () => {
    assert.equal(typeof getPasswordUpdateRedirectPath, "function");
    assert.doesNotMatch(
      String(getPasswordUpdateRedirectPath),
      /profiles|role|owner/i,
    );
  });
});
