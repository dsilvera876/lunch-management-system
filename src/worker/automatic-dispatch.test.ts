import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyAutomaticDispatchExitCode,
  runAutomaticDispatch,
  type PrimaryDispatchExecutor,
  type SupplementDispatchExecutor,
} from "@/worker/automatic-dispatch";

const batch = {
  provider_id: "11111111-1111-4111-8111-111111111111",
  scheduled_delivery_date: "2026-01-02",
  order_date: "2026-01-01",
};

function createMockSupabase(handlers: {
  primaryBatches?: unknown[];
  supplementBatches?: unknown[];
  supplementListError?: string;
  primaryClaimResult?: { action: string };
}): SupabaseClient {
  return {
    rpc: async (name: string) => {
      if (name === "worker_sweep_stale_pending_dispatches") {
        return { data: 0, error: null };
      }
      if (name === "worker_sweep_stale_pending_primary_dispatches") {
        return { data: 0, error: null };
      }
      if (name === "worker_list_due_automatic_primary_batches") {
        return { data: handlers.primaryBatches ?? [], error: null };
      }
      if (name === "worker_list_due_automatic_supplement_batches") {
        if (handlers.supplementListError) {
          return { data: null, error: { message: handlers.supplementListError } };
        }
        return { data: handlers.supplementBatches ?? [], error: null };
      }
      if (name === "worker_claim_automatic_provider_primary_order") {
        return {
          data: handlers.primaryClaimResult ?? {
            action: "send",
            dispatch_id: "22222222-2222-4222-8222-222222222222",
            provider_email: "kitchen@example.test",
            order_ids: ["33333333-3333-4333-8333-333333333333"],
          },
          error: null,
        };
      }
      if (name === "worker_claim_automatic_provider_late_order_supplement") {
        return {
          data: {
            action: "send",
            dispatch_id: "44444444-4444-4444-8444-444444444444",
            provider_email: "kitchen@example.test",
            order_ids: ["55555555-5555-4555-8555-555555555555"],
          },
          error: null,
        };
      }

      throw new Error(`Unexpected RPC ${name}`);
    },
  } as unknown as SupabaseClient;
}

describe("automatic dispatch worker", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("wires worker entry to apply exit code from automatic dispatch failures", () => {
    const worker = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
    assert.match(worker, /applyAutomaticDispatchExitCode\(failures\)/);
    assert.match(worker, /runAutomaticDispatch\(supabase, options\.dryRun\)/);
  });

  it("applyAutomaticDispatchExitCode sets non-zero exit when failures > 0", () => {
    process.exitCode = 0;
    assert.equal(applyAutomaticDispatchExitCode(2), 2);
    assert.equal(process.exitCode, 1);
  });

  it("applyAutomaticDispatchExitCode leaves exit zero when there are no failures", () => {
    process.exitCode = 0;
    assert.equal(applyAutomaticDispatchExitCode(0), 0);
    assert.equal(process.exitCode, 0);
  });

  it("A: primary automatic failure only yields non-zero failure count and exit code", async () => {
    const supabase = createMockSupabase({
      primaryBatches: [batch],
      supplementBatches: [],
    });

    const executePrimary: PrimaryDispatchExecutor = async () => ({
      success: false,
      error: "SMTP rejected",
    });

    const failures = await runAutomaticDispatch(supabase, false, { executePrimary });
    assert.equal(failures, 1);

    process.exitCode = 0;
    applyAutomaticDispatchExitCode(failures);
    assert.equal(process.exitCode, 1);
  });

  it("B: supplemental automatic failure only yields non-zero failure count and exit code", async () => {
    const supabase = createMockSupabase({
      primaryBatches: [],
      supplementBatches: [{ provider_id: batch.provider_id, scheduled_delivery_date: batch.scheduled_delivery_date }],
    });

    const executeSupplement: SupplementDispatchExecutor = async () => ({
      success: false,
      error: "SMTP rejected",
    });

    const failures = await runAutomaticDispatch(supabase, false, { executeSupplement });
    assert.equal(failures, 1);

    process.exitCode = 0;
    applyAutomaticDispatchExitCode(failures);
    assert.equal(process.exitCode, 1);
  });

  it("C: no due primary or supplement work yields zero failures and exit code", async () => {
    const supabase = createMockSupabase({
      primaryBatches: [],
      supplementBatches: [],
    });

    const failures = await runAutomaticDispatch(supabase, false);
    assert.equal(failures, 0);

    process.exitCode = 0;
    applyAutomaticDispatchExitCode(failures);
    assert.equal(process.exitCode, 0);
  });

  it("D: one primary provider failure still processes later primary batches", async () => {
    const secondProvider = {
      provider_id: "66666666-6666-4666-8666-666666666666",
      scheduled_delivery_date: batch.scheduled_delivery_date,
      order_date: batch.order_date,
    };

    const supabase = createMockSupabase({
      primaryBatches: [batch, secondProvider],
      supplementBatches: [],
    });

    const attemptedProviders: string[] = [];

    const executePrimary: PrimaryDispatchExecutor = async (_client, _claim, input) => {
      attemptedProviders.push(input.providerId);
      if (input.providerId === batch.provider_id) {
        return { success: false, error: "first provider failed" };
      }
      return { success: true, dispatchId: "ok", orderCount: 1 };
    };

    const failures = await runAutomaticDispatch(supabase, false, { executePrimary });

    assert.deepEqual(attemptedProviders, [batch.provider_id, secondProvider.provider_id]);
    assert.equal(failures, 1);
    applyAutomaticDispatchExitCode(failures);
    assert.equal(process.exitCode, 1);
  });

  it("dry run does not invoke primary send executor", async () => {
    const supabase = createMockSupabase({
      primaryBatches: [batch],
      supplementBatches: [],
    });

    let primaryCalls = 0;
    const executePrimary: PrimaryDispatchExecutor = async () => {
      primaryCalls += 1;
      return { success: true, dispatchId: "x", orderCount: 1 };
    };

    const failures = await runAutomaticDispatch(supabase, true, { executePrimary });
    assert.equal(failures, 0);
    assert.equal(primaryCalls, 0);
  });

  it("skips already_sent primary claim without invoking send executor", async () => {
    const supabase = createMockSupabase({
      primaryBatches: [batch],
      supplementBatches: [],
      primaryClaimResult: { action: "already_sent" },
    });

    let primaryCalls = 0;
    const executePrimary: PrimaryDispatchExecutor = async () => {
      primaryCalls += 1;
      return { success: true, dispatchId: "x", orderCount: 1 };
    };

    const failures = await runAutomaticDispatch(supabase, false, { executePrimary });
    assert.equal(failures, 0);
    assert.equal(primaryCalls, 0);
  });

  it("counts attention_required primary outcomes as failures", async () => {
    const supabase = createMockSupabase({
      primaryBatches: [batch],
      supplementBatches: [],
    });

    const executePrimary: PrimaryDispatchExecutor = async () => ({
      success: false,
      error: "ambiguous transport",
      attentionRequired: true,
    });

    const failures = await runAutomaticDispatch(supabase, false, { executePrimary });
    assert.equal(failures, 1);
  });
});
