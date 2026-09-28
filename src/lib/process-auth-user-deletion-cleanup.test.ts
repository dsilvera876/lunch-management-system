import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attemptAuthAdminDeleteUser,
  finalizeAuthUserDeletion,
  processAuthUserDeletionCleanup,
} from "@/lib/process-auth-user-deletion-cleanup";

describe("auth user deletion cleanup", () => {
  it("treats missing auth user as success", async () => {
    const service = {
      auth: {
        admin: {
          deleteUser: async () => ({
            error: { message: "User not found" },
          }),
        },
      },
    };

    const attempt = await attemptAuthAdminDeleteUser("profile-1", service as never);
    assert.equal(attempt.outcome, "missing_user");
  });

  it("records retry outcome through finalize RPC", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const service = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return {
          data: { auth_delete_status: "pending" },
          error: null,
        };
      },
    };

    const status = await finalizeAuthUserDeletion(service as never, "audit-1", {
      outcome: "retry",
      message: "Temporary outage",
    });

    assert.equal(status, "pending");
    const firstCall = calls[0] as { name: string; args: { p_outcome: string } };
    assert.equal(firstCall.name, "service_finalize_auth_user_deletion");
    assert.equal(firstCall.args.p_outcome, "retry");
  });

  it("worker processes claimed rows and finalizes success", async () => {
    let deleteCalls = 0;
    const service = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "worker_claim_pending_auth_user_deletions") {
          return {
            data: [
              {
                id: "audit-1",
                deleted_profile_id: "profile-1",
                normalized_email: "user@example.test",
                auth_delete_status: "pending",
              },
            ],
            error: null,
          };
        }

        if (name === "service_finalize_auth_user_deletion") {
          assert.equal(args?.p_outcome, "succeeded");
          return { data: { auth_delete_status: "succeeded" }, error: null };
        }

        throw new Error(`Unexpected RPC ${name}`);
      },
      auth: {
        admin: {
          deleteUser: async () => {
            deleteCalls += 1;
            return { error: null };
          },
        },
      },
    };

    const result = await processAuthUserDeletionCleanup(service as never, { batchSize: 5 });

    assert.equal(result.claimed, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(deleteCalls, 1);
  });
});
