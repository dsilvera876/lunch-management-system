import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { processDeadlineReminderNotifications } from "@/lib/process-deadline-reminder-notifications";
import { processHrPendingSignupNotifications } from "@/lib/process-hr-pending-signup-notifications";
import { runMailQueueNotificationProcessors } from "@/worker/mail-queue-notification-processors";

const pendingSignupDelivery = {
  delivery_id: "00000000-0000-4000-8000-000000000101",
  event_key: "hr.pending_signup",
  signup_request_id: "00000000-0000-4000-8000-000000000201",
  operational_date: "2099-01-10",
  recipient_email: "hr@example.test",
  recipient_name: "HR Reviewer",
};

const pendingSignupTemplate = {
  subject_template: "Review {{requester_name}}",
  body_html_template: "<p>{{requester_email}}</p><p>{{review_url}}</p>",
  body_text_template: "{{requester_email}} {{review_url}}",
};

function createQuietSupabase(options: { failPendingSignupList?: boolean } = {}): SupabaseClient {
  return {
    rpc: async (name: string) => {
      if (
        options.failPendingSignupList &&
        name === "worker_list_pending_hr_signup_notification_deliveries"
      ) {
        return { data: null, error: { message: "simulated pending signup list failure" } };
      }

      if (name.startsWith("worker_list_pending")) {
        return { data: [], error: null };
      }

      if (name.startsWith("worker_get_")) {
        return { data: [], error: null };
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
    assert.doesNotMatch(rpcCalls.join("\n"), /worker_prepare_deadline_reminder_batch/);
    assert.doesNotMatch(rpcCalls.join("\n"), /worker_queue_notification_delivery/);
    assert.doesNotMatch(rpcCalls.join("\n"), /worker_record_notification_render_failure/);
    assert.doesNotMatch(rpcCalls.join("\n"), /worker_update_notification_processing_run/);
  });

  it("renders representative notifications during dry-run without queue writes", async () => {
    const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const priorOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";

    const successfulRequestId = pendingSignupDelivery.signup_request_id;
    const failedRequestId = "00000000-0000-4000-8000-000000000202";
    const supabase = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        rpcCalls.push({ name, args });

        if (name === "worker_list_pending_hr_signup_notification_deliveries") {
          return {
            data: [
              pendingSignupDelivery,
              {
                ...pendingSignupDelivery,
                delivery_id: "00000000-0000-4000-8000-000000000102",
                signup_request_id: failedRequestId,
              },
            ],
            error: null,
          };
        }
        if (name === "worker_get_notification_email_template") {
          return { data: [pendingSignupTemplate], error: null };
        }
        if (name === "worker_get_hr_pending_signup_notification_context") {
          const requestId = args?.p_signup_request_id;
          return {
            data: [
              {
                requester_name:
                  requestId === successfulRequestId ? "Renée O'Connor" : "Invalid Date",
                requester_email: "requester@example.test",
                requested_at:
                  requestId === successfulRequestId
                    ? "2099-01-10T15:00:00Z"
                    : "not-a-timestamp",
              },
            ],
            error: null,
          };
        }
        if (name.startsWith("worker_list_pending")) {
          return { data: [], error: null };
        }
        if (name.startsWith("worker_get_")) {
          return { data: [], error: null };
        }
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;

    try {
      const result = await processHrPendingSignupNotifications(supabase, {
        dryRun: true,
      });

      assert.equal(result.queued, 0);
      assert.equal(result.skipped, 1);
      assert.equal(result.renderFailures, 1);
      assert.equal(result.failures, 1);
      assert.equal(
        rpcCalls.filter(
          ({ name }) => name === "worker_get_hr_pending_signup_notification_context",
        ).length,
        2,
      );
      assert.equal(
        rpcCalls.filter(({ name }) => name === "worker_get_notification_email_template")
          .length,
        1,
      );
      assert.equal(
        rpcCalls.some(({ name }) => name === "worker_queue_notification_delivery"),
        false,
      );
      assert.equal(
        rpcCalls.some(({ name }) => name === "worker_record_notification_render_failure"),
        false,
      );
    } finally {
      if (priorOrigin === undefined) {
        delete process.env.APP_ORIGIN;
      } else {
        process.env.APP_ORIGIN = priorOrigin;
      }
    }
  });

  it("does not invoke any database RPC for a deadline-reminder dry-run", async () => {
    const supabase = {
      rpc: async (name: string) => {
        throw new Error(`Unexpected dry-run RPC ${name}`);
      },
    } as unknown as SupabaseClient;

    const result = await processDeadlineReminderNotifications(supabase, {
      dryRun: true,
      asOf: "2099-01-10T15:00:00Z",
    });

    assert.equal(result.prepared, false);
    assert.equal(result.queued, 0);
    assert.equal(result.failures, 0);
  });

  it("preserves deadline reminder preparation during normal execution", async () => {
    const rpcCalls: string[] = [];
    const supabase = {
      rpc: async (name: string) => {
        rpcCalls.push(name);
        if (name === "worker_prepare_deadline_reminder_batch") {
          return { data: { action: "skipped", reason: "outside_window" }, error: null };
        }
        return { data: [], error: null };
      },
    } as unknown as SupabaseClient;

    await runMailQueueNotificationProcessors(supabase, false);

    assert.equal(
      rpcCalls.filter((name) => name === "worker_prepare_deadline_reminder_batch").length,
      1,
    );
  });

  it("queues a successfully rendered notification during normal execution", async () => {
    const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const priorOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    const supabase = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === "worker_list_pending_hr_signup_notification_deliveries") {
          return { data: [pendingSignupDelivery], error: null };
        }
        if (name === "worker_get_notification_email_template") {
          return { data: [pendingSignupTemplate], error: null };
        }
        if (name === "worker_get_hr_pending_signup_notification_context") {
          return {
            data: [
              {
                requester_name: "José Álvarez",
                requester_email: "requester@example.test",
                requested_at: "2099-01-10T15:00:00Z",
              },
            ],
            error: null,
          };
        }
        if (name === "worker_queue_notification_delivery") {
          return { data: null, error: null };
        }
        if (name === "worker_prepare_deadline_reminder_batch") {
          return { data: { action: "skipped", reason: "outside_window" }, error: null };
        }
        if (name.startsWith("worker_list_pending")) {
          return { data: [], error: null };
        }
        if (name.startsWith("worker_get_")) {
          return { data: [], error: null };
        }
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;

    try {
      const result = await runMailQueueNotificationProcessors(supabase, false);

      assert.equal(result.stages[1]?.failures, 0);
      const queueCall = rpcCalls.find(
        ({ name }) => name === "worker_queue_notification_delivery",
      );
      assert.ok(queueCall);
      assert.equal(queueCall.args?.p_delivery_id, pendingSignupDelivery.delivery_id);
      assert.match(String(queueCall.args?.p_subject), /José Álvarez/);
    } finally {
      if (priorOrigin === undefined) {
        delete process.env.APP_ORIGIN;
      } else {
        process.env.APP_ORIGIN = priorOrigin;
      }
    }
  });

  it("continues later stages when an earlier notification processor fails", async () => {
    const supabase = createQuietSupabase({ failPendingSignupList: true });
    const result = await runMailQueueNotificationProcessors(supabase, true);

    assert.equal(result.stages[0]?.aborted, false);
    assert.equal(result.stages[1]?.aborted, true);
    assert.equal(result.stages[1]?.stage, "HR pending signup notifications");
    assert.equal(result.stages[7]?.aborted, false);
    assert.equal(
      result.stages[7]?.stage,
      "Staff late order request status notifications",
    );
  });
});
