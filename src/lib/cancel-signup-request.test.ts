import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { orchestrateSignupRequestCancellation } from "./cancel-signup-request";

describe("orchestrateSignupRequestCancellation", () => {
  it("finalizes immediately when no auth cleanup is required", async () => {
    const supabase = {
      rpc: async (name: string) => {
        assert.equal(name, "cancel_signup_request");
        return {
          data: [
            {
              success: true,
              outcome_code: "cancelled",
              message: "Signup request cancelled.",
              auth_user_id: null,
              audit_id: null,
            },
          ],
          error: null,
        };
      },
    };

    const result = await orchestrateSignupRequestCancellation({
      supabase: supabase as never,
      requestId: "req-1",
      reason: "incorrect_email",
    });

    assert.equal(result.success, true);
  });

  it("surfaces blocking outcomes from the database without claiming success", async () => {
    const supabase = {
      rpc: async (name: string) => {
        assert.equal(name, "cancel_signup_request");
        return {
          data: [
            {
              success: false,
              outcome_code: "business_history",
              message: "This account has lunch history and cannot be removed from signup review.",
              auth_user_id: null,
              audit_id: null,
            },
          ],
          error: null,
        };
      },
    };

    const result = await orchestrateSignupRequestCancellation({
      supabase: supabase as never,
      requestId: "req-2",
      reason: "duplicate_request",
    });

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.match(result.message, /lunch history/i);
    assert.equal(result.retryable, false);
  });
});
