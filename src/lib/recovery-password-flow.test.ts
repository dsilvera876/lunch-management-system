import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getPasswordResetInvalidLinkPath } from "./auth-recovery";

describe("recovery password flow wiring", () => {
  it("routes missing recovery session to invalid-link UX", () => {
    const page = readFileSync(
      new URL("../app/account/update-password/page.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/account/update-password/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(page, /getPasswordResetInvalidLinkPath/);
    assert.match(actions, /getPasswordResetInvalidLinkPath/);
    assert.equal(getPasswordResetInvalidLinkPath(), "/forgot-password?error=invalid-link");
  });

  it("does not mutate account_status during password update", () => {
    const actions = readFileSync(
      new URL("../app/account/update-password/actions.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(actions, /account_status/);
    assert.match(actions, /updateUser\(\{ password \}\)/);
  });

  it("keeps forgot-password enumeration-neutral success path", () => {
    const forgotActions = readFileSync(
      new URL("../app/forgot-password/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(forgotActions, /getPasswordResetRequestSuccessPath/);
    assert.doesNotMatch(forgotActions, /profiles/);
    assert.doesNotMatch(forgotActions, /account_status/);
  });
});
