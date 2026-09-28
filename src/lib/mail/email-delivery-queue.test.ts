import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { enqueueAuthSendEmailHook } from "@/lib/mail/process-auth-send-email-hook";
import { processEmailDeliveryQueue } from "@/lib/mail/process-email-delivery-queue";

describe("async auth email delivery", () => {
  it("enqueue hook returns success without invoking SMTP", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    let enqueueCalls = 0;

    const result = await enqueueAuthSendEmailHook(
      {
        user: { email: "invite@example.test" },
        email_data: {
          token: "",
          token_hash: "invite-hash",
          token_new: "",
          token_hash_new: "",
          redirect_to: "https://example.test/account/update-password?invite=1",
          email_action_type: "invite",
          site_url: "https://example.test",
        },
      },
      {
        getServiceClient: () => ({}) as never,
        enqueue: async () => {
          enqueueCalls += 1;
          return { success: true, queueId: "queue-1" };
        },
      },
    );

    process.env.APP_ORIGIN = previousOrigin;

    assert.equal(result.success, true);
    assert.equal(enqueueCalls, 1);
  });

  it("preserves invite type mapping in queued auth hook content path", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    let capturedText = "";

    await enqueueAuthSendEmailHook(
      {
        user: { email: "invite@example.test" },
        email_data: {
          token: "",
          token_hash: "invite-hash",
          token_new: "",
          token_hash_new: "",
          redirect_to: "https://example.test/account/update-password?invite=1",
          email_action_type: "invite",
          site_url: "https://example.test",
        },
      },
      {
        getServiceClient: () => ({}) as never,
        enqueue: async (_client, input) => {
          capturedText = input.textBody;
          return { success: true, queueId: "queue-1" };
        },
      },
    );

    process.env.APP_ORIGIN = previousOrigin;

    assert.match(capturedText, /type=invite/);
    assert.doesNotMatch(capturedText, /type=signup/);
  });

  it("worker sends claimed queue rows through generic sendEmail", async () => {
    let sendCalls = 0;
    const supabase = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "worker_claim_email_delivery_queue") {
          return {
            data: [
              {
                id: "q-1",
                message_type: "auth_hook",
                recipient_email: "user@example.test",
                subject: "Subject",
                text_body: "Body",
                html_body: "<p>Body</p>",
                status: "processing",
                attempts: 1,
                correlation_type: null,
                correlation_id: null,
              },
            ],
            error: null,
          };
        }

        if (name === "worker_should_deliver_email_queue_message") {
          return { data: true, error: null };
        }

        if (name === "worker_complete_email_delivery") {
          assert.equal(args?.p_outcome, "sent");
          return { data: null, error: null };
        }

        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const result = await processEmailDeliveryQueue(supabase as never, {}, {
      loadRuntimeConfig: async () => ({
        providerType: "smtp",
        providerName: "Test",
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpSecurity: "starttls",
        smtpUsername: "user",
        smtpPassword: "pass",
        fromEmail: "noreply@example.test",
        fromName: "LMS",
        replyToEmail: null,
        enabled: true,
      }),
      sendSmtp: async () => {
        sendCalls += 1;
        return { success: true };
      },
    });

    assert.equal(result.claimed, 1);
    assert.equal(result.sent, 1);
    assert.equal(sendCalls, 1);
  });

  it("does not log token hashes from the auth hook route", () => {
    const route = readFileSync(
      new URL("../../app/api/auth/hooks/send-email/route.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(route, /token_hash/);
    assert.doesNotMatch(route, /console\.(log|info|debug).*payload/i);
  });
});
