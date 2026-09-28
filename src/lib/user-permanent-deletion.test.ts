import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canShowPermanentDeleteInUserManagement,
  emailsMatchForDeletionConfirmation,
  parseUserDeletionEligibility,
  sanitizePermanentDeleteErrorMessage,
} from "./user-deletion";

describe("user permanent deletion presentation", () => {
  it("parses eligibility RPC payload", () => {
    const parsed = parseUserDeletionEligibility({
      profile_id: "abc",
      can_delete: false,
      blocker_codes: ["business_history"],
      blocker_summary: "This account has lunch history and cannot be permanently deleted. HR should deactivate the account instead.",
    });

    assert.equal(parsed?.canDelete, false);
    assert.equal(parsed?.blockerCodes[0], "business_history");
  });

  it("requires case-insensitive trimmed email confirmation", () => {
    assert.equal(
      emailsMatchForDeletionConfirmation("  Person@Example.com ", "person@example.com"),
      true,
    );
    assert.equal(emailsMatchForDeletionConfirmation("wrong@test.local", "right@test.local"), false);
  });

  it("limits permanent delete UI to Admin and Owner", () => {
    assert.equal(canShowPermanentDeleteInUserManagement("admin"), true);
    assert.equal(canShowPermanentDeleteInUserManagement("owner"), true);
    assert.equal(canShowPermanentDeleteInUserManagement("hr"), false);
    assert.equal(canShowPermanentDeleteInUserManagement("staff"), false);
    assert.equal(canShowPermanentDeleteInUserManagement("accounts"), false);
  });

  it("sanitizes raw auth/database errors", () => {
    assert.match(
      sanitizePermanentDeleteErrorMessage("JWT expired secret token"),
      /Try again or contact support/,
    );
  });
});

describe("user permanent deletion UI wiring", () => {
  it("edit drawer includes danger zone for Admin/Owner management", () => {
    const editDrawer = readFileSync(
      new URL("../components/admin/edit-user-drawer.tsx", import.meta.url),
      "utf8",
    );
    const section = readFileSync(
      new URL("../components/admin/user-permanent-delete-section.tsx", import.meta.url),
      "utf8",
    );

    assert.match(editDrawer, /UserPermanentDeleteSection/);
    assert.match(section, /Delete account permanently/);
    assert.match(section, /Delete Account Permanently/);
    assert.match(section, /disabled=\{isPending \|\| !emailConfirmed\}/);
    assert.match(section, /partialMessage/);
    assert.match(section, /Danger zone/);
  });

  it("server orchestration uses Auth admin delete and partial success", () => {
    const orchestration = readFileSync(
      new URL("./permanent-user-deletion.ts", import.meta.url),
      "utf8",
    );

    assert.match(orchestration, /runAuthUserDeletionAttemptForAudit/);
    assert.match(orchestration, /success: "partial"/);
    assert.match(orchestration, /permanently_delete_user_account/);
  });

  it("HR workspace does not expose permanent delete", () => {
    const hrDrawer = readFileSync(
      new URL("../components/admin/hr-user-details-drawer.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(hrDrawer, /Delete account permanently/);
    assert.doesNotMatch(hrDrawer, /UserPermanentDeleteSection/);
  });
});
