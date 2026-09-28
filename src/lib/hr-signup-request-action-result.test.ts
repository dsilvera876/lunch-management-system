import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSignupDrawerActionOutcome } from "./hr-signup-request-action-result";

describe("HR signup drawer action outcomes", () => {
  it("closes cleanly on full success without stale error state", () => {
    const outcome = resolveSignupDrawerActionOutcome({ success: true });
    assert.equal(outcome.kind, "success");
    if (outcome.kind !== "success") {
      throw new Error("expected success outcome");
    }
    assert.equal(outcome.closeDrawer, true);
    assert.equal(outcome.refreshList, true);
  });

  it("keeps the drawer open with a warning for partial success", () => {
    const outcome = resolveSignupDrawerActionOutcome({
      success: true,
      warning: "Invitation sent, but Employee ID could not be saved.",
    });
    assert.equal(outcome.kind, "partial");
    if (outcome.kind !== "partial") {
      throw new Error("expected partial outcome");
    }
    assert.equal(outcome.closeDrawer, false);
  });

  it("surfaces persistent errors without auto-closing the drawer", () => {
    const outcome = resolveSignupDrawerActionOutcome({
      success: false,
      error: "User approved, but the account setup email could not be sent. You can retry the invitation.",
    });
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") {
      throw new Error("expected error outcome");
    }
    assert.equal(outcome.closeDrawer, false);
    assert.equal(outcome.refreshList, true);
  });
});
