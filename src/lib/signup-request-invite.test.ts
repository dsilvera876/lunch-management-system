import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  INVITE_DELIVERY_FAILURE_MESSAGE,
  orchestrateSignupRequestInvite,
  sanitizeInviteErrorMessage,
  signupRequestNeedsInvitationRetry,
  type AccountSetupEmailQueueClient,
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

function createQueue(
  overrides: Partial<AccountSetupEmailQueueClient> = {},
): AccountSetupEmailQueueClient {
  const base: AccountSetupEmailQueueClient = {
    enqueueAccountSetupInvite: async () => ({ ok: true }),
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
    let queueCalls = 0;

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
      queue: createQueue({
        enqueueAccountSetupInvite: async () => {
          queueCalls += 1;
          return { ok: true };
        },
      }),
    });

    assert.equal(result.success, true);
    assert.equal(inviteCalls, 1);
    assert.equal(generateCalls, 0);
    assert.equal(queueCalls, 0);
  });

  it("does not mark invite_sent_at during HR approval when Auth hook will queue delivery", async () => {
    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb(),
      admin: createAdmin(),
      queue: createQueue(),
    });

    assert.equal(result.success, true);
  });

  it("existing-user retry generates link and enqueues account setup mail", async () => {
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
      queue: createQueue({
        enqueueAccountSetupInvite: async (payload) => {
          sentSetupUrl = payload.setupUrl;
          return { ok: true };
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

  it("does not mark invite_sent_at when queue enqueue fails on retry path", async () => {
    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
      }),
      admin: createAdmin(),
      queue: createQueue({
        enqueueAccountSetupInvite: async () => ({
          ok: false,
          errorMessage: "Email provider unavailable",
        }),
      }),
    });

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
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
      queue: createQueue(),
    });

    assert.equal(result.success, true);
    assert.equal(approveCalls, 1);
  });

  it("links an existing auth profile instead of creating another user", async () => {
    let inviteCalls = 0;
    let queuedEmail = false;

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
      queue: createQueue({
        enqueueAccountSetupInvite: async () => {
          queuedEmail = true;
          return { ok: true };
        },
      }),
    });

    assert.equal(result.success, true);
    assert.equal(inviteCalls, 0);
    assert.equal(queuedEmail, true);
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
      queue: createQueue(),
    });

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.equal(result.error, INVITE_DELIVERY_FAILURE_MESSAGE);
    assert.equal(recordedError, "Email provider unavailable");
    assert.equal(result.recoverable, true);
  });

  it("links profile after successful retry enqueue without setting invite_sent_at", async () => {
    let linkedProfileId: string | null = null;

    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
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
      queue: createQueue(),
    });

    assert.equal(result.success, true);
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
      queue: createQueue(),
    });

    assert.equal(result.success, true);
    if (!result.success) {
      throw new Error("expected success with warning");
    }
    assert.match(result.warning ?? "", /Employee ID could not be saved/i);
  });

  it("returns recoverable failure when retry enqueue fails", async () => {
    const result = await orchestrateSignupRequestInvite({
      requestId: "req-1",
      employeeIdInput: "",
      redirectTo: INVITE_REDIRECT,
      db: createDb({
        lookupProfileIdByEmail: async () => "existing-profile",
      }),
      admin: createAdmin(),
      queue: createQueue({
        enqueueAccountSetupInvite: async () => ({
          ok: false,
          errorMessage: "Email delivery is disabled.",
        }),
      }),
    });

    assert.equal(result.success, false);
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
      queue: createQueue(),
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
