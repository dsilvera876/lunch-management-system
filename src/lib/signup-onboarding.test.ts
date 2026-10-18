import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("signup onboarding completion wiring", () => {
  it("calls service-only onboarding completion after invite password update", () => {
    const actions = readFileSync(
      new URL("../app/account/update-password/actions.ts", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/account/update-password/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(actions, /createServiceClient/);
    assert.match(actions, /service_complete_signup_onboarding[\s\S]*p_user_id: user\.id/);
    assert.match(actions, /completionRow\?\.ok !== true/);
    assert.match(actions, /\["completed", "already_completed"\]\.includes/);
    assert.match(actions, /getPasswordUpdateErrorPath\(isRecovery, "setup", true\)/);
    assert.ok(
      actions.indexOf("auth.updateUser") < actions.indexOf("service_complete_signup_onboarding"),
      "onboarding completion must follow the successful password update",
    );
    assert.match(page, /params\.error === "setup"/);
  });
});
