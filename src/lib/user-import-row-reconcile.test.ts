import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planUserImportRowExecution, type UserImportRowRecord } from "@/lib/user-import-row-reconcile";

function baseRow(overrides: Partial<UserImportRowRecord> = {}): UserImportRowRecord {
  return {
    id: "row-1",
    batch_id: "batch-1",
    row_number: 2,
    full_name: "Pat Example",
    email: "pat@example.test",
    normalized_email: "pat@example.test",
    employee_id: null,
    classification: "new_external",
    action_code: "create_and_invite",
    profile_id: null,
    signup_request_id: null,
    ...overrides,
  };
}

describe("user import row reconcile", () => {
  it("routes preview new-user rows through invite execution", () => {
    const plan = planUserImportRowExecution({
      row: baseRow(),
      resolvedProfileId: null,
    });
    assert.equal(plan.mode, "invite");
  });

  it("resumes invite when update_existing was frozen but no profile exists yet", () => {
    const plan = planUserImportRowExecution({
      row: baseRow({
        classification: "existing_active",
        action_code: "update_existing",
      }),
      resolvedProfileId: null,
    });
    assert.equal(plan.mode, "invite");
  });

  it("updates when a compatible profile exists at execution time", () => {
    const plan = planUserImportRowExecution({
      row: baseRow({
        classification: "existing_active",
        action_code: "update_existing",
        profile_id: "profile-1",
      }),
      resolvedProfileId: "profile-1",
      accountStatus: "active",
      role: "staff",
    });
    assert.equal(plan.mode, "update");
    if (plan.mode === "update") {
      assert.equal(plan.profileId, "profile-1");
    }
  });

  it("skips inactive accounts", () => {
    const plan = planUserImportRowExecution({
      row: baseRow({ classification: "existing_inactive", action_code: "skip_inactive" }),
      resolvedProfileId: "profile-inactive",
      accountStatus: "inactive",
      role: "staff",
    });
    assert.equal(plan.mode, "skip");
  });

  it("blocks when a privileged account appears after preview", () => {
    const plan = planUserImportRowExecution({
      row: baseRow(),
      resolvedProfileId: "profile-hr",
      accountStatus: "active",
      role: "hr",
    });
    assert.equal(plan.mode, "incompatible");
  });
});
