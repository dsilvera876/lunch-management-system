import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("signup onboarding completion wiring", () => {
  it("calls complete_signup_onboarding after invite password update", () => {
    const actions = readFileSync(
      new URL("../app/account/update-password/actions.ts", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/account/update-password/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(actions, /complete_signup_onboarding[\s\S]*p_require_linked_request: true/);
    assert.match(actions, /code === "no_signup_request"/);
    assert.match(actions, /getPasswordUpdateErrorPath\(isRecovery, "setup", true\)/);
    assert.match(page, /params\.error === "setup"/);
  });
});
