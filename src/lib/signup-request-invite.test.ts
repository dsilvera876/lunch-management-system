import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPLOYEE_ID_AFTER_INVITE_FAILURE_PREFIX,
  INVITE_DELIVERY_FAILURE_MESSAGE,
  orchestrateSignupRequestInvite,
  sanitizeInviteErrorMessage,
  signupRequestNeedsInvitationRetry,
  type AdminInviteClient,
  type SignupInviteDbClient,
  type SignupRequestInviteState,
} from "./signup-request-invite";

const INVITE_REDIRECT = "https://example.test/account/update-password?invite=1";

function requestState(
  overrides: Partial<SignupRequestInviteState> = {},
): SignupRequestInviteState {
  return {
    requestId: "00000000-0000-4000-8000-000000000001",
    email: "alex@gmail.com",
    fullName: "Alex External",
    status: "pending",
    createdProfileId: null,
    requestedEmployeeId: null,
    onboardingEstablished: false,
    ...overrides,
  };
}

function createDb(overrides: Partial<SignupInviteDbClient> = {}): SignupInviteDbClient {
  return {
    getRequest: async () => requestState(),
    markApproved: async () => ({
      ok: true,
      row: {
        email: "alex@gmail.com",
        fullName: "Alex External",
        status: "approved",
        createdProfileId: null,
        requestedEmployeeId: null,
      },
    }),
    lookupProfileIdByEmail: async () => null,
    waitForProfileId: async (userId) => userId,
    recordInviteFailure: async () => undefined,
    prepareAccountSetupRecovery: async () => ({ outcome: "prepared" }),
    linkProfile: async () => ({ ok: true }),
    setEmployeeId: async () => ({ ok: true }),
    ...overrides,
  };
}

function createAdmin(overrides: Partial<AdminInviteClient> = {}): AdminInviteClient {
  return {
    inviteUserByEmail: async () => ({
      data: { user: { id: "00000000-0000-4000-8000-000000000002" } },
      error: null,
    }),
    requestPasswordRecovery: async () => ({ error: null }),
    ...overrides,
  };
}

describe("signup request invite orchestration", () => {
  it("sanitizes secret-like invite errors and action links", () => {
    const sanitized = sanitizeInviteErrorMessage(
      "SMTP token=abc123 failed https://example.test/auth?token_hash=secret",
    );
    assert.match(sanitized, /token=\[redacted\]/i);
    assert.doesNotMatch(sanitized, /abc123|token_hash=secret/);
    assert.match(sanitized, /\[redacted-url\]/);
  });

  it("uses the ordinary Auth invite flow for a new identity", async () => {
    let inviteCalls = 0;
    let recoveryCalls = 0;
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb(),
      admin: createAdmin({
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          return { data: { user: { id: "profile-1" } }, error: null };
        },
        requestPasswordRecovery: async () => {
          recoveryCalls += 1;
          return { error: null };
        },
      }),
    });

    assert.deepEqual(result, { success: true, outcome: "queued" });
    assert.equal(inviteCalls, 1);
    assert.equal(recoveryCalls, 0);
  });

  it("recovers a linked incomplete account without replacing its Auth identity", async () => {
    const profileId = "00000000-0000-4000-8000-000000000003";
    let preparedNonce = "";
    let recoveryRedirect = "";
    let recoveryContext: { nonce: string; expectedAuthUserId: string } | null = null;
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () =>
          requestState({ status: "approved", createdProfileId: profileId }),
        prepareAccountSetupRecovery: async (_requestId, expectedProfileId, nonce) => {
          assert.equal(expectedProfileId, profileId);
          preparedNonce = nonce;
          return { outcome: "prepared" };
        },
      }),
      admin: createAdmin({
        inviteUserByEmail: async () => {
          throw new Error("invite must not run");
        },
        requestPasswordRecovery: async (email, options) => {
          assert.equal(email, "alex@gmail.com");
          recoveryRedirect = options.redirectTo;
          recoveryContext = options.accountSetup;
          return { error: null };
        },
      }),
    });

    assert.deepEqual(result, { success: true, outcome: "queued" });
    assert.equal(recoveryRedirect, INVITE_REDIRECT);
    assert.deepEqual(recoveryContext, {
      nonce: preparedNonce,
      expectedAuthUserId: profileId,
    });
    assert.match(preparedNonce, /^[0-9a-f-]{36}$/i);
    assert.doesNotMatch(recoveryRedirect, /token_hash|code=/i);
  });

  it("links an existing matching identity before preparing recovery", async () => {
    const profileId = "00000000-0000-4000-8000-000000000004";
    const events: string[] = [];
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => profileId,
        linkProfile: async (_requestId, linkedId) => {
          events.push(`link:${linkedId}`);
          return { ok: true };
        },
        prepareAccountSetupRecovery: async (_requestId, linkedId) => {
          events.push(`prepare:${linkedId}`);
          return { outcome: "prepared" };
        },
      }),
      admin: createAdmin({
        inviteUserByEmail: async () => ({
          data: { user: null },
          error: { message: "User already registered" },
        }),
        requestPasswordRecovery: async () => {
          events.push("recover");
          return { error: null };
        },
      }),
    });

    assert.deepEqual(result, { success: true, outcome: "queued" });
    assert.deepEqual(events, [`link:${profileId}`, `prepare:${profileId}`, "recover"]);
  });

  it("does not call Auth again for completed linked accounts", async () => {
    let authCalls = 0;
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () => requestState({
          status: "approved",
          createdProfileId: "profile-complete",
          onboardingEstablished: true,
        }),
      }),
      admin: createAdmin({
        inviteUserByEmail: async () => {
          authCalls += 1;
          return { data: { user: null }, error: { message: "must not run" } };
        },
        requestPasswordRecovery: async () => {
          authCalls += 1;
          return { error: null };
        },
      }),
    });

    assert.deepEqual(result, { success: true, outcome: "already_complete" });
    assert.equal(authCalls, 0);
  });

  it("treats completion found at preparation as an idempotent no-op", async () => {
    let authCalls = 0;
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () => requestState({
          status: "approved",
          createdProfileId: "profile-completing",
        }),
        prepareAccountSetupRecovery: async () => ({ outcome: "completed" }),
      }),
      admin: createAdmin({
        requestPasswordRecovery: async () => {
          authCalls += 1;
          return { error: null };
        },
      }),
    });

    assert.deepEqual(result, { success: true, outcome: "already_complete" });
    assert.equal(authCalls, 0);
  });

  it("fails safely when the authoritative identity check rejects recovery", async () => {
    let authCalls = 0;
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () => requestState({
          status: "approved",
          createdProfileId: "profile-mismatch",
        }),
        prepareAccountSetupRecovery: async () => ({
          outcome: "error",
          errorMessage: "Auth identity email does not match signup request",
        }),
      }),
      admin: createAdmin({
        requestPasswordRecovery: async () => {
          authCalls += 1;
          return { error: null };
        },
      }),
    });

    assert.deepEqual(result, {
      success: false,
      error: INVITE_DELIVERY_FAILURE_MESSAGE,
      recoverable: true,
    });
    assert.equal(authCalls, 0);
  });

  it("records a sanitized failure when Auth or hook queueing rejects recovery", async () => {
    let recorded = "";
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () => requestState({
          status: "approved",
          createdProfileId: "profile-error",
        }),
        recordInviteFailure: async (_requestId, message) => {
          recorded = message;
        },
      }),
      admin: createAdmin({
        requestPasswordRecovery: async () => ({
          error: { message: "token=secret https://auth.example.test/private" },
        }),
      }),
    });

    assert.equal(result.success, false);
    assert.doesNotMatch(recorded, /secret|auth\.example/i);
  });

  it("permits safe subsequent attempts with independent purpose nonces", async () => {
    const nonces: string[] = [];
    let resetCalls = 0;
    const db = createDb({
      getRequest: async () => requestState({
        status: "approved",
        createdProfileId: "profile-retry",
      }),
      prepareAccountSetupRecovery: async (_requestId, _profileId, nonce) => {
        nonces.push(nonce);
        return { outcome: "prepared" };
      },
    });
    const admin = createAdmin({
      requestPasswordRecovery: async () => {
        resetCalls += 1;
        return { error: null };
      },
    });

    for (let index = 0; index < 2; index += 1) {
      const result = await orchestrateSignupRequestInvite({
        requestId: "request-1",
        employeeIdInput: "",
        redirectTo: INVITE_REDIRECT,
        db,
        admin,
      });
      assert.deepEqual(result, { success: true, outcome: "queued" });
    }

    assert.equal(resetCalls, 2);
    assert.equal(new Set(nonces).size, 2);
  });

  it("preserves account creation while reporting Employee ID assignment failure", async () => {
    const result = await orchestrateSignupRequestInvite({
      requestId: "request-1",
      employeeIdInput: "1234",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        setEmployeeId: async () => ({ ok: false, errorMessage: "Duplicate Employee ID." }),
      }),
      admin: createAdmin(),
    });

    assert.equal(result.success, true);
    assert.match(
      result.success ? (result.warning ?? "") : "",
      new RegExp(EMPLOYEE_ID_AFTER_INVITE_FAILURE_PREFIX),
    );
  });

  it("identifies only approved incomplete requests as retry candidates", () => {
    assert.equal(
      signupRequestNeedsInvitationRetry(
        requestState({ status: "approved", onboardingEstablished: false }),
      ),
      true,
    );
    assert.equal(
      signupRequestNeedsInvitationRetry(
        requestState({ status: "approved", onboardingEstablished: true }),
      ),
      false,
    );
    assert.equal(signupRequestNeedsInvitationRetry(requestState({ status: "pending" })), false);
  });
});
