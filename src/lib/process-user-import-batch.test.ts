import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  drainUserImportWork,
  processUserImportBatch,
  resolveUserImportClaimBatchSize,
  USER_IMPORT_WORKER_CLAIM_CHUNK,
} from "@/lib/process-user-import-batch";
import { USER_IMPORT_MAX_ROWS } from "@/lib/user-import-csv";
import { userImportRuntimeUserFacingMessages } from "@/lib/user-import-runtime-errors";
import { planUserImportRowExecution } from "@/lib/user-import-row-reconcile";

function makeSkippedImportRow(id: string, rowNumber: number) {
  return {
    id,
    batch_id: "batch-1",
    row_number: rowNumber,
    full_name: "Inactive",
    email: `user-${rowNumber}@test.local`,
    normalized_email: `user-${rowNumber}@test.local`,
    employee_id: null,
    classification: "existing_inactive",
    action_code: "skip_inactive",
    profile_id: null,
    signup_request_id: null,
  };
}

function createClaimSequenceMock(sequence: number[]) {
  let claimIndex = 0;
  const service = {
    rpc: async (name: string) => {
      if (name === "worker_claim_user_import_rows") {
        const count = sequence[claimIndex] ?? 0;
        claimIndex += 1;
        const rows = Array.from({ length: count }, (_, index) =>
          makeSkippedImportRow(`row-${claimIndex}-${index}`, index + 1),
        );
        return { data: rows, error: null };
      }

      if (name === "worker_complete_user_import_row") {
        return { data: null, error: null };
      }

      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  return { service, getClaimIndex: () => claimIndex };
}

describe("drain user import work", () => {
  it("limits the final claim to remaining activation capacity", () => {
    assert.equal(resolveUserImportClaimBatchSize(25, 2000, 1990), 10);
    assert.equal(resolveUserImportClaimBatchSize(25, 2000, 2000), 0);
    assert.equal(resolveUserImportClaimBatchSize(25, 30, 25), 5);
  });

  it("passes a reduced p_limit on the last partial chunk of an activation", async () => {
    const claimLimits: number[] = [];
    const service = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "worker_claim_user_import_rows") {
          const limit = Number(args?.p_limit ?? 0);
          claimLimits.push(limit);
          const count = limit;
          const rows = Array.from({ length: count }, (_, index) =>
            makeSkippedImportRow(`row-${claimLimits.length}-${index}`, index + 1),
          );
          return { data: rows, error: null };
        }

        if (name === "worker_complete_user_import_row") {
          return { data: null, error: null };
        }

        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const result = await drainUserImportWork(service as never, {
      maxRowsPerActivation: 30,
      claimChunkSize: 25,
    });

    assert.equal(result.claimed, 30);
    assert.deepEqual(claimLimits, [25, 5]);
  });

  it("wires worker entry point to drain until idle", () => {
    const worker = readFileSync(new URL("../worker/run.ts", import.meta.url), "utf8");
    assert.match(worker, /drainUserImportWork/);
    assert.match(worker, /claims=\$\{result\.claimPasses\}/);
    assert.match(worker, /\[bulk-user-import\] pass=/);
  });

  it("exits immediately when no rows are claimable", async () => {
    const { service } = createClaimSequenceMock([0]);
    const result = await drainUserImportWork(service as never);

    assert.equal(result.claimPasses, 0);
    assert.equal(result.claimed, 0);
  });

  it("uses one claim pass for five rows", async () => {
    const { service, getClaimIndex } = createClaimSequenceMock([5, 0]);
    const result = await drainUserImportWork(service as never, { claimChunkSize: 25 });

    assert.equal(result.claimPasses, 1);
    assert.equal(result.claimed, 5);
    assert.equal(result.skipped, 5);
    assert.equal(getClaimIndex(), 2);
  });

  it("uses one claim pass for six rows when chunk size allows", async () => {
    const { service, getClaimIndex } = createClaimSequenceMock([6, 0]);
    const result = await drainUserImportWork(service as never, { claimChunkSize: 25 });

    assert.equal(result.claimPasses, 1);
    assert.equal(result.claimed, 6);
    assert.equal(getClaimIndex(), 2);
  });

  it("drains six rows across multiple claim passes in one activation", async () => {
    const { service, getClaimIndex } = createClaimSequenceMock([5, 1, 0]);
    const passLog: number[] = [];
    const result = await drainUserImportWork(service as never, {
      claimChunkSize: 5,
      logPass: (_pass, claimed) => {
        passLog.push(claimed);
      },
    });

    assert.equal(result.claimPasses, 2);
    assert.equal(result.claimed, 6);
    assert.deepEqual(passLog, [5, 1]);
    assert.equal(getClaimIndex(), 3);
  });

  it("drains more than one chunk without waiting for another timer", async () => {
    const { service, getClaimIndex } = createClaimSequenceMock([25, 10, 0]);
    const result = await drainUserImportWork(service as never, { claimChunkSize: 25 });

    assert.equal(result.claimPasses, 2);
    assert.equal(result.claimed, 35);
    assert.equal(getClaimIndex(), 3);
  });

  it("simulates a 2,000-row import within one activation", async () => {
    let remaining = USER_IMPORT_MAX_ROWS;
    let claimCalls = 0;
    const service = {
      rpc: async (name: string) => {
        if (name === "worker_claim_user_import_rows") {
          claimCalls += 1;
          const count = Math.min(USER_IMPORT_WORKER_CLAIM_CHUNK, remaining);
          remaining -= count;
          const rows = Array.from({ length: count }, (_, index) =>
            makeSkippedImportRow(`row-${claimCalls}-${index}`, index + 1),
          );
          return { data: rows, error: null };
        }

        if (name === "worker_complete_user_import_row") {
          return { data: null, error: null };
        }

        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const result = await drainUserImportWork(service as never);

    assert.equal(result.claimed, USER_IMPORT_MAX_ROWS);
    assert.equal(result.claimPasses, USER_IMPORT_MAX_ROWS / USER_IMPORT_WORKER_CLAIM_CHUNK);
    assert.equal(claimCalls, USER_IMPORT_MAX_ROWS / USER_IMPORT_WORKER_CLAIM_CHUNK);
    assert.equal(remaining, 0);
  });

  it("stops at the per-activation safety bound when work remains", async () => {
    let claimCalls = 0;
    const service = {
      rpc: async (name: string) => {
        if (name === "worker_claim_user_import_rows") {
          claimCalls += 1;
          const rows = Array.from({ length: USER_IMPORT_WORKER_CLAIM_CHUNK }, (_, index) =>
            makeSkippedImportRow(`row-${claimCalls}-${index}`, index + 1),
          );
          return { data: rows, error: null };
        }

        if (name === "worker_complete_user_import_row") {
          return { data: null, error: null };
        }

        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const cap = 50;
    const result = await drainUserImportWork(service as never, {
      maxRowsPerActivation: cap,
      claimChunkSize: 25,
    });

    assert.equal(result.claimed, cap);
    assert.equal(result.claimPasses, 2);
    assert.equal(claimCalls, 2);
  });

  it("terminates when claim returns zero after prior passes", async () => {
    const { service, getClaimIndex } = createClaimSequenceMock([3, 0]);
    const result = await drainUserImportWork(service as never, { claimChunkSize: 5 });

    assert.equal(result.claimPasses, 1);
    assert.equal(result.claimed, 3);
    assert.equal(getClaimIndex(), 2);
  });
});

describe("process user import batch worker", () => {
  it("skips inactive rows and completes successful profile updates", async () => {
    const rpcCalls: string[] = [];
    const service = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        rpcCalls.push(name);

        if (name === "worker_claim_user_import_rows") {
          return {
            data: [
              {
                id: "row-inactive",
                batch_id: "batch-1",
                row_number: 1,
                full_name: "Inactive",
                email: "inactive@test.local",
                normalized_email: "inactive@test.local",
                employee_id: null,
                classification: "existing_inactive",
                action_code: "skip_inactive",
                profile_id: "profile-inactive",
                signup_request_id: null,
              },
              {
                id: "row-update",
                batch_id: "batch-1",
                row_number: 2,
                full_name: "Admin User",
                email: "admin@test.local",
                normalized_email: "admin@test.local",
                employee_id: null,
                classification: "existing_privileged",
                action_code: "update_existing",
                profile_id: "profile-admin",
                signup_request_id: null,
              },
            ],
            error: null,
          };
        }

        if (name === "service_apply_user_import_profile_update") {
          assert.equal(args?.p_import_row_id, "row-update");
          return { data: "profile-admin", error: null };
        }

        if (name === "worker_complete_user_import_row") {
          return { data: null, error: null };
        }

        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const result = await processUserImportBatch(service as never, { batchSize: 5 });

    assert.equal(result.claimed, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 0);
    assert.ok(rpcCalls.includes("worker_complete_user_import_row"));
  });

  it("continues batch when a runtime row fails", async () => {
    const service = {
      rpc: async (name: string) => {
        if (name === "worker_claim_user_import_rows") {
          return {
            data: [
              {
                id: "row-fail",
                batch_id: "batch-1",
                row_number: 1,
                full_name: "Broken",
                email: "broken@test.local",
                normalized_email: "broken@test.local",
                employee_id: null,
                classification: "existing_active",
                action_code: "update_existing",
                profile_id: null,
                signup_request_id: null,
              },
            ],
            error: null,
          };
        }

        if (name === "worker_complete_user_import_row") {
          return { data: null, error: null };
        }

        return { data: null, error: null };
      },
    };

    const result = await processUserImportBatch(service as never, { batchSize: 1 });
    assert.equal(result.failed, 1);
  });

  it("reconciles stale update rows into invite resume when profile is still missing", () => {
    const plan = planUserImportRowExecution({
      row: {
        id: "row-1",
        batch_id: "batch-1",
        row_number: 2,
        full_name: "Pat",
        email: "pat@example.test",
        normalized_email: "pat@example.test",
        employee_id: null,
        classification: "new_external",
        action_code: "update_existing",
        profile_id: null,
        signup_request_id: "signup-1",
      },
      resolvedProfileId: null,
    });
    assert.equal(plan.mode, "invite");
  });

  it("stores HR-safe messages when invite setup fails for missing APP_ORIGIN", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousOrigin = env.APP_ORIGIN;
    const previousNodeEnv = env.NODE_ENV;
    delete env.APP_ORIGIN;
    env.NODE_ENV = "production";

    let completedMessage = "";

    const service = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "worker_claim_user_import_rows") {
          return {
            data: [
              {
                id: "row-invite",
                batch_id: "batch-1",
                row_number: 2,
                full_name: "Pat Example",
                email: "pat@example.test",
                normalized_email: "pat@example.test",
                employee_id: null,
                classification: "new_external",
                action_code: "create_and_invite",
                profile_id: null,
                signup_request_id: "signup-1",
              },
            ],
            error: null,
          };
        }

        if (name === "ensure_signup_request_for_bulk_import") {
          return { data: "signup-1", error: null };
        }

        if (name === "authorize_rejected_signup_for_bulk_import") {
          return { data: null, error: null };
        }

        if (name === "worker_complete_user_import_row") {
          completedMessage = String(args?.p_message ?? "");
          return { data: null, error: null };
        }

        return { data: null, error: null };
      },
      auth: {
        admin: {
          inviteUserByEmail: async () => ({ data: { user: null }, error: null }),
          generateLink: async () => ({ data: null, error: null }),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    };

    try {
      const result = await processUserImportBatch(service as never, { batchSize: 1 });
      assert.equal(result.failed, 1);
      assert.equal(completedMessage, userImportRuntimeUserFacingMessages.SYSTEM_CONFIGURATION);
      assert.doesNotMatch(completedMessage, /APP_ORIGIN/i);
    } finally {
      env.NODE_ENV = previousNodeEnv;
      if (previousOrigin === undefined) {
        delete env.APP_ORIGIN;
      } else {
        env.APP_ORIGIN = previousOrigin;
      }
    }
  });
});
