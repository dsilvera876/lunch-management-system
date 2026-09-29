import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { processUserImportBatch } from "@/lib/process-user-import-batch";
import { userImportRuntimeUserFacingMessages } from "@/lib/user-import-runtime-errors";
import { planUserImportRowExecution } from "@/lib/user-import-row-reconcile";

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
