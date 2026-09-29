import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  signupCancellationReasonLabel,
  signupRequestCanCancel,
} from "./signup-request-cancellation";
import type { SignupRequestRow } from "./signup-request-presentation";

function row(overrides: Partial<SignupRequestRow> = {}): SignupRequestRow {
  return {
    request_id: "req-1",
    full_name: "Test User",
    email: "test@example.com",
    status: "pending",
    requested_at: new Date().toISOString(),
    requested_employee_id: null,
    created_profile_id: null,
    invite_sent_at: null,
    invite_last_error: null,
    cancelled_at: null,
    cancellation_reason: null,
    cancellation_note: null,
    onboarding_established: false,
    total_count: 1,
    ...overrides,
  };
}

describe("signup request cancellation", () => {
  it("allows cancel for pending and approved onboarding-incomplete requests", () => {
    assert.equal(signupRequestCanCancel(row()), true);
    assert.equal(signupRequestCanCancel(row({ status: "approved" })), true);
    assert.equal(
      signupRequestCanCancel(
        row({ status: "approved", created_profile_id: "profile-id", onboarding_established: false }),
      ),
      true,
    );
    assert.equal(signupRequestCanCancel(row({ status: "rejected" })), false);
    assert.equal(signupRequestCanCancel(row({ status: "cancelled" })), false);
    assert.equal(
      signupRequestCanCancel(
        row({ status: "approved", created_profile_id: "profile-id", onboarding_established: true }),
      ),
      false,
    );
  });

  it("maps cancellation reason codes to friendly labels", () => {
    assert.equal(signupCancellationReasonLabel("incorrect_email"), "Incorrect email address");
    assert.equal(signupCancellationReasonLabel(null), null);
  });

  it("wires cancel UI, dialog copy, and success toast in HR workspace", () => {
    const drawer = readFileSync(
      new URL("../components/admin/hr-signup-request-drawer.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/hr-signup-requests-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(drawer, /Cancel signup request\?/);
    assert.match(drawer, /Keep Request/);
    assert.match(drawer, /Cancel Request/);
    assert.match(drawer, /signupRequestCanCancel/);
    assert.match(drawer, /cancelSignupRequest/);
    assert.match(workspace, /Signup request cancelled\./);
    assert.match(workspace, /value="cancelled"/);
    assert.match(drawer, /isCancelled/);
    assert.match(drawer, /onboardingIncomplete/);
    assert.match(drawer, /completed account setup/);
  });
});
