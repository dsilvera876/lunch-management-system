import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { processEmailDeliveryQueue } from "@/lib/mail/process-email-delivery-queue";

const queueRow = {
  id: "00000000-0000-4000-8000-000000000001",
  message_type: "test",
  recipient_email: "recipient@example.test",
  subject: "Test message",
  text_body: "Test body",
  html_body: "<p>Test body</p>",
  status: "processing",
  attempts: 1,
  correlation_type: null,
  correlation_id: null,
};

describe("processEmailDeliveryQueue", () => {
  it("uses only read-only diagnostics during dry-run", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    let smtpCalls = 0;

    const supabase = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        calls.push({ name, args });
        assert.equal(name, "worker_email_delivery_queue_claim_diagnostics");
        return {
          data: {
            pending_ready: 3,
            pending_future: 2,
            processing: 1,
            processing_stale: 1,
          },
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    const result = await processEmailDeliveryQueue(
      supabase,
      { batchSize: 25, dryRun: true },
      {
        loadRuntimeConfig: async () => {
          throw new Error("dry-run must not load SMTP configuration");
        },
        sendSmtp: async () => {
          smtpCalls += 1;
          return { success: true };
        },
      },
    );

    assert.deepEqual(calls, [
      { name: "worker_email_delivery_queue_claim_diagnostics", args: undefined },
    ]);
    assert.equal(smtpCalls, 0);
    assert.equal(result.claimed, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.retried, 0);
    assert.equal(result.failed, 0);
    assert.deepEqual(result.diagnostics, {
      pendingReady: 3,
      pendingFuture: 2,
      processing: 1,
      processingStale: 1,
    });
  });

  it("does not fall through to claiming when dry-run diagnostics fail", async () => {
    const calls: string[] = [];
    const supabase = {
      rpc: async (name: string) => {
        calls.push(name);
        return { data: null, error: { message: "diagnostics unavailable" } };
      },
    } as unknown as SupabaseClient;

    await assert.rejects(
      processEmailDeliveryQueue(supabase, { dryRun: true }),
      /Email queue diagnostics failed: diagnostics unavailable/,
    );

    assert.deepEqual(calls, ["worker_email_delivery_queue_claim_diagnostics"]);
  });

  it("claims, sends, and finalizes eligible messages during normal execution", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    let smtpCalls = 0;
    const supabase = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        calls.push({ name, args });

        if (name === "worker_claim_email_delivery_queue") {
          return { data: [queueRow], error: null };
        }
        if (name === "worker_should_deliver_email_queue_message") {
          return { data: true, error: null };
        }
        if (name === "worker_complete_email_delivery") {
          return { data: null, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    } as unknown as SupabaseClient;

    const result = await processEmailDeliveryQueue(supabase, {}, {
      loadRuntimeConfig: async () => ({
        providerType: "smtp",
        providerName: "Test SMTP",
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpSecurity: "starttls",
        smtpUsername: "user",
        smtpPassword: "password",
        fromEmail: "noreply@example.test",
        fromName: "Lunch Management",
        replyToEmail: null,
        enabled: true,
      }),
      sendSmtp: async () => {
        smtpCalls += 1;
        return { success: true };
      },
    });

    assert.equal(smtpCalls, 1);
    assert.equal(result.claimed, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.retried, 0);
    assert.equal(result.failed, 0);
    assert.equal(calls[0]?.name, "worker_claim_email_delivery_queue");
    assert.deepEqual(calls.at(-1), {
      name: "worker_complete_email_delivery",
      args: {
        p_queue_id: queueRow.id,
        p_outcome: "sent",
        p_error: null,
      },
    });
  });

  it("returns failed delivery to the existing retry path below the attempt limit", async () => {
    const completions: Record<string, unknown>[] = [];
    const supabase = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === "worker_claim_email_delivery_queue") {
          return { data: [{ ...queueRow, attempts: 2 }], error: null };
        }
        if (name === "worker_should_deliver_email_queue_message") {
          return { data: true, error: null };
        }
        if (name === "worker_complete_email_delivery") {
          completions.push(args ?? {});
          return { data: null, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    } as unknown as SupabaseClient;

    const result = await processEmailDeliveryQueue(supabase, {}, {
      loadRuntimeConfig: async () => ({
        providerType: "smtp",
        providerName: "Test SMTP",
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpSecurity: "starttls",
        smtpUsername: "user",
        smtpPassword: "password",
        fromEmail: "noreply@example.test",
        fromName: "Lunch Management",
        replyToEmail: null,
        enabled: true,
      }),
      sendSmtp: async () => ({ success: false, error: "temporary SMTP failure" }),
    });

    assert.equal(result.retried, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(completions, [
      {
        p_queue_id: queueRow.id,
        p_outcome: "failed",
        p_error: "temporary SMTP failure",
      },
    ]);
  });

  it("reports a terminal failure at the existing maximum attempt count", async () => {
    const supabase = {
      rpc: async (name: string) => {
        if (name === "worker_claim_email_delivery_queue") {
          return { data: [{ ...queueRow, attempts: 5 }], error: null };
        }
        if (name === "worker_should_deliver_email_queue_message") {
          return { data: true, error: null };
        }
        if (name === "worker_complete_email_delivery") {
          return { data: null, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    } as unknown as SupabaseClient;

    const result = await processEmailDeliveryQueue(supabase, {}, {
      loadRuntimeConfig: async () => ({
        providerType: "smtp",
        providerName: "Test SMTP",
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpSecurity: "starttls",
        smtpUsername: "user",
        smtpPassword: "password",
        fromEmail: "noreply@example.test",
        fromName: "Lunch Management",
        replyToEmail: null,
        enabled: true,
      }),
      sendSmtp: async () => ({ success: false, error: "terminal SMTP failure" }),
    });

    assert.equal(result.retried, 0);
    assert.equal(result.failed, 1);
  });
});
