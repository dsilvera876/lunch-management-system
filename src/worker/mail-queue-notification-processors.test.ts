import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runMailQueueNotificationProcessors } from "@/worker/mail-queue-notification-processors";

function createQuietSupabase(options: { failDeadlinePrepare?: boolean } = {}): SupabaseClient {
  return {
    rpc: async (name: string) => {
      if (
        options.failDeadlinePrepare &&
        name === "worker_prepare_deadline_reminder_batch"
      ) {
        return { data: null, error: { message: "simulated deadline prepare failure" } };
      }

      if (name.startsWith("worker_list_pending")) {
        return { data: [], error: null };
      }

      if (name.startsWith("worker_get_")) {
        return { data: [], error: null };
      }

      if (name === "worker_prepare_deadline_reminder_batch") {
        return { data: { action: "skipped" }, error: null };
      }

      if (name.startsWith("worker_prepare_")) {
        return { data: null, error: null };
      }

      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
}

describe("mail queue notification processors", () => {
  it("runs staff late-order status notifications in the mail timer pipeline", async () => {
    const rpcCalls: string[] = [];
    const supabase = {
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: [], error: null };
      },
    } as unknown as SupabaseClient;

    const result = await runMailQueueNotificationProcessors(supabase, true);

    assert.equal(result.stages.length, 8);
    assert.equal(
      result.stages[6]?.stage,
      "HR late order submitted notifications",
    );
    assert.equal(
      result.stages[7]?.stage,
      "Staff late order request status notifications",
    );
    assert.match(
      rpcCalls.join("\n"),
      /worker_list_pending_staff_late_order_request_status_deliveries/,
    );
    assert.match(rpcCalls.join("\n"), /worker_list_pending_staff_order_deliveries/);
  });

  it("continues later stages when an earlier notification processor fails", async () => {
    const supabase = createQuietSupabase({ failDeadlinePrepare: true });
    const result = await runMailQueueNotificationProcessors(supabase, true);

    assert.equal(result.stages[0]?.aborted, true);
    assert.equal(result.stages[0]?.stage, "Deadline reminder notifications");
    assert.equal(result.stages[7]?.aborted, false);
    assert.equal(
      result.stages[7]?.stage,
      "Staff late order request status notifications",
    );
  });
});
