import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  INVITE_DELIVERY_FAILURE_MESSAGE,
  orchestrateSignupRequestInvite,
  sanitizeInviteErrorMessage,
  signupRequestNeedsInvitationRetry,
  type AccountSetupEmailClient,
  type AdminInviteClient,
  type SignupInviteDbClient,
} from "./signup-request-invite";

const INVITE_REDIRECT = "https://example.test/account/update-password?invite=1";
const INVITE_TOKEN_HASH = "secret-hash";

function createDb(overrides: Partial<SignupInviteDbClient> = {}): SignupInviteDbClient {
  const base: SignupInviteDbClient = {
    getRequest: async () => ({
      requestId: "req-1",
      email: "alex@gmail.com",
      fullName: "Alex External",
      status: "pending",
      createdProfileId: null,
      requestedEmployeeId: null,
    }),
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
    recordInviteDelivered: async () => ({ ok: true }),
    linkProfile: async () => ({ ok: true }),
    setEmployeeId: async () => ({ ok: true }),
  };

  return { ...base, ...overrides };
}

function createAdmin(overrides: Partial<AdminInviteClient> = {}): AdminInviteClient {
  const base: AdminInviteClient = {
    inviteUserByEmail: async () => ({
      data: { user: { id: "user-1" } },
      error: null,
    }),
    generateInviteLink: async () => ({
      data: { user: { id: "user-1" }, tokenHash: INVITE_TOKEN_HASH },
      error: null,
    }),
  };

  return { ...base, ...overrides };
}

function createEmail(
  overrides: Partial<AccountSetupEmailClient> = {},
): AccountSetupEmailClient {
  const base: AccountSetupEmailClient = {
    sendAccountSetupEmail: async () => ({ success: true }),
  };

  return { ...base, ...overrides };
}

describe("signup request invite orchestration", () => {
  const savedOrigin = process.env.APP_ORIGIN;

  before(() => {
    process.env.APP_ORIGIN = "https://example.test";
  });

  after(() => {
    process.env.APP_ORIGIN = savedOrigin;
  });

  it("sanitizes secret-like invite errors and action links", () => {
    const sanitized = sanitizeInviteErrorMessage(
      "SMTP token=abc123 failed https://example.test/auth?token_hash=secret",
    );
    assert.match(sanitized, /token=\[redacted\]/i);
    assert.doesNotMatch(sanitized, /abc123/);
    assert.doesNotMatch(sanitized, /token_hash=secret/);
    assert.match(sanitized, /\[redacted-url\]/);
  });

  it("uses inviteUserByEmail for new-user approval", async () => {
    let inviteCalls = 0;
    let generateCalls = 0;
    let emailCalls = 0;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb(),
      admin: createAdmin({
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          return { data: { user: { id: "user-1" } }, error: null };
        },
        generateInviteLink: async () => {
          generateCalls += 1;
          return { data: { user: { id: "user-1" }, tokenHash: INVITE_TOKEN_HASH }, error: null };
        },
      }),
      email: createEmail({
        sendAccountSetupEmail: async () => {
          emailCalls += 1;
          return { success: true };
        },
      }),
    });

    assert.equal(result.success, true);
    assert.equal(inviteCalls, 1);
    assert.equal(generateCalls, 0);
    assert.equal(emailCalls, 0);
  });

  it("records delivery only after inviteUserByEmail succeeds", async () => {
    let deliveredRecorded = false;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        recordInviteDelivered: async () => {
          deliveredRecorded = true;
          return { ok: true };
        },
      }),
      admin: createAdmin(),
      email: createEmail(),
    });

    assert.equal(result.success, true);
    assert.equal(deliveredRecorded, true);
  });

  it("existing-user retry generates link and sends it through the email adapter", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    let inviteCalls = 0;
    let generateCalls = 0;
    let sentSetupUrl: string | null = null;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () => ({
          requestId: "req-1",
          email: "alex@gmail.com",
          fullName: "Alex External",
          status: "approved",
          createdProfileId: null,
          requestedEmployeeId: null,
        }),
        lookupProfileIdByEmail: async () => "existing-profile",
      }),
      admin: createAdmin({
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          return { data: { user: null }, error: { message: "should not run" } };
        },
        generateInviteLink: async () => {
          generateCalls += 1;
          return {
            data: { user: { id: "existing-profile" }, tokenHash: INVITE_TOKEN_HASH },
            error: null,
          };
        },
      }),
      email: createEmail({
        sendAccountSetupEmail: async (payload) => {
          sentSetupUrl = payload.setupUrl;
          return { success: true };
        },
      }),
    });

    process.env.APP_ORIGIN = previousOrigin;

    assert.equal(result.success, true);
    assert.equal(inviteCalls, 0);
    assert.equal(generateCalls, 1);
    assert.match(sentSetupUrl ?? "", /type=invite/);
    assert.doesNotMatch(sentSetupUrl ?? "", /type=signup/);
    assert.match(sentSetupUrl ?? "", /token_hash=secret-hash/);
    assert.match(sentSetupUrl ?? "", /next=%2Faccount%2Fupdate-password%3Finvite%3D1/);
  });

  it("does not record delivery when generateLink succeeds but email send fails", async () => {
    let deliveredRecorded = false;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
        recordInviteDelivered: async () => {
          deliveredRecorded = true;
          return { ok: true };
        },
      }),
      admin: createAdmin(),
      email: createEmail({
        sendAccountSetupEmail: async () => ({
          success: false,
          error: "Email provider unavailable",
        }),
      }),
    });

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.equal(deliveredRecorded, false);
    assert.equal(result.error, INVITE_DELIVERY_FAILURE_MESSAGE);
  });

  it("resumes approved requests without requiring pending status", async () => {
    let approveCalls = 0;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        getRequest: async () => ({
          requestId: "req-1",
          email: "alex@gmail.com",
          fullName: "Alex External",
          status: "approved",
          createdProfileId: null,
          requestedEmployeeId: null,
        }),
        markApproved: async () => {
          approveCalls += 1;
          return {
            ok: true,
            row: {
              email: "alex@gmail.com",
              fullName: "Alex External",
              status: "approved",
              createdProfileId: null,
              requestedEmployeeId: null,
            },
          };
        },
        lookupProfileIdByEmail: async () => "existing-profile",
      }),
      admin: createAdmin(),
      email: createEmail(),
    });

    assert.equal(result.success, true);
    assert.equal(approveCalls, 1);
  });

  it("links an existing auth profile instead of creating another user", async () => {
    let inviteCalls = 0;
    let sentEmail = false;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
      }),
      admin: createAdmin({
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          return { data: { user: null }, error: { message: "User already registered" } };
        },
      }),
      email: createEmail({
        sendAccountSetupEmail: async () => {
          sentEmail = true;
          return { success: true };
        },
      }),
    });

    assert.equal(result.success, true);
    assert.equal(inviteCalls, 0);
    assert.equal(sentEmail, true);
  });

  it("records invite failure and returns recoverable HR message", async () => {
    let recordedError: string | null = null;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        recordInviteFailure: async (_requestId, message) => {
          recordedError = message;
        },
      }),
      admin: createAdmin({
        inviteUserByEmail: async () => ({
          data: { user: null },
          error: { message: "Email provider unavailable" },
        }),
        generateInviteLink: async () => ({
          data: null,
          error: { message: "Email provider unavailable" },
        }),
      }),
      email: createEmail(),
    });

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.equal(result.error, INVITE_DELIVERY_FAILURE_MESSAGE);
    assert.equal(recordedError, "Email provider unavailable");
    assert.equal(result.recoverable, true);
  });

  it("clears delivery errors after successful direct send", async () => {
    let deliveredRecorded = false;
    let linkedProfileId: string | null = null;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
        recordInviteDelivered: async () => {
          deliveredRecorded = true;
          return { ok: true };
        },
        linkProfile: async (_requestId, profileId) => {
          linkedProfileId = profileId;
          return { ok: true };
        },
      }),
      admin: createAdmin({
        generateInviteLink: async () => ({
          data: { user: { id: "existing-profile" }, tokenHash: INVITE_TOKEN_HASH },
          error: null,
        }),
      }),
      email: createEmail(),
    });

    assert.equal(result.success, true);
    assert.equal(deliveredRecorded, true);
    assert.equal(linkedProfileId, "existing-profile");
  });

  it("keeps account creation when Employee ID assignment fails", async () => {
    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "0054",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        setEmployeeId: async () => ({
          ok: false,
          errorMessage: "Employee ID 0054 is already assigned to another user",
        }),
      }),
      admin: createAdmin(),
      email: createEmail(),
    });

    assert.equal(result.success, true);
    if (!result.success) {
      throw new Error("expected success with warning");
    }
    assert.match(result.warning ?? "", /Employee ID could not be saved/i);
  });

  it("does not record delivery when account setup email send fails", async () => {
    let deliveredRecorded = false;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
        recordInviteDelivered: async () => {
          deliveredRecorded = true;
          return { ok: true };
        },
      }),
      admin: createAdmin(),
      email: createEmail({
        sendAccountSetupEmail: async () => ({
          success: false,
          error: "Email delivery is disabled.",
        }),
      }),
    });

    assert.equal(result.success, false);
    assert.equal(deliveredRecorded, false);
  });

  it("returns a warning instead of a red error when linking fails after invite delivery", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        linkProfile: async () => ({ ok: false, errorMessage: "profile trigger lag" }),
      }),
      admin: createAdmin(),
      email: createEmail(),
    });

    process.env.APP_ORIGIN = previousOrigin;

    assert.equal(result.success, true);
    if (!result.success) {
      throw new Error("expected partial success");
    }
    assert.match(result.warning ?? "", /could not be linked/i);
  });

  it("detects approved requests that need invitation retry", () => {
    assert.equal(
      signupRequestNeedsInvitationRetry({
        requestId: "req-1",
        email: "a@b.com",
        fullName: "A",
        status: "approved",
        createdProfileId: null,
        requestedEmployeeId: null,
      }),
      true,
    );
  });
});
