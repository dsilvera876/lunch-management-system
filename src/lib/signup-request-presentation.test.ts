import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  signupRequestListActionLabel,
  signupRequestOnboardingIncomplete,
  signupRequestStatusBadgeKind,
  type SignupRequestRow,
} from "./signup-request-presentation";

function row(overrides: Partial<SignupRequestRow> = {}): SignupRequestRow {
  return {
    request_id: "req-1",
    full_name: "Test User",
    email: "test@example.com",
    status: "approved",
    requested_at: new Date().toISOString(),
    requested_employee_id: null,
    created_profile_id: "profile-id",
    invite_sent_at: new Date().toISOString(),
    invite_last_error: null,
    cancelled_at: null,
    cancellation_reason: null,
    cancellation_note: null,
    onboarding_established: false,
    total_count: 1,
    ...overrides,
  };
}

describe("signup request presentation", () => {
  it("uses signup lifecycle status badges, not profile account_status", () => {
    assert.equal(signupRequestStatusBadgeKind("approved"), "approved");
    assert.equal(signupRequestStatusBadgeKind("pending"), "pending");
    assert.equal(signupRequestStatusBadgeKind("rejected"), "rejected");
    assert.equal(signupRequestStatusBadgeKind("cancelled"), "cancelled");
  });

  it("shows View for approved linked incomplete onboarding", () => {
    const linkedIncomplete = row({
      status: "approved",
      created_profile_id: "profile-id",
      onboarding_established: false,
    });

    assert.equal(signupRequestOnboardingIncomplete(linkedIncomplete), true);
    assert.equal(signupRequestListActionLabel(linkedIncomplete), "View");
  });

  it("shows View only for completed onboarding", () => {
    const completed = row({ onboarding_established: true });
    assert.equal(signupRequestOnboardingIncomplete(completed), false);
    assert.equal(signupRequestListActionLabel(completed), "View");
  });

  it("shows Retry invitation only for approved unlinked incomplete invites", () => {
    const unlinked = row({ created_profile_id: null, onboarding_established: false });
    assert.equal(signupRequestListActionLabel(unlinked), "Retry invitation");
  });

  it("wires workspace to lifecycle badges and list actions", () => {
    const workspace = readFileSync(
      new URL("../components/admin/hr-signup-requests-workspace.tsx", import.meta.url),
      "utf8",
    );
    const statusBadge = readFileSync(
      new URL("../components/ui/status-badge.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /signupRequestStatusBadgeKind/);
    assert.match(workspace, /signupRequestListActionLabel/);
    assert.doesNotMatch(workspace, /status === "approved"[\s\S]*"active"/);
    assert.match(statusBadge, /approved: "Approved"/);
    assert.match(workspace, /openDrawer\(request\)/);
  });
});
