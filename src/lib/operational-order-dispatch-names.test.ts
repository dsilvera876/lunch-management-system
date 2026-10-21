import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeSupplementalDispatch } from "./late-order-supplement-dispatch";
import { executePrimaryProviderDispatch } from "./provider-primary-order-dispatch";

type RpcCall = { name: string; args: Record<string, unknown> };

function createDisplayNameFailureClient(): {
  client: SupabaseClient;
  rpcCalls: RpcCall[];
} {
  const rpcCalls: RpcCall[] = [];
  const client = {
    from: (table: string) => {
      if (table === "lunch_providers") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { name: "Provider" }, error: null }),
            }),
          }),
        };
      }

      assert.equal(table, "orders");
      return {
        select: () => ({
          in: async () => ({ data: [{ id: "order-1" }], error: null }),
        }),
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });

      if (name === "list_operational_order_display_names") {
        return {
          data: null,
          error: { message: "denied", code: "42501", details: "", hint: "" },
        };
      }

      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  return { client, rpcCalls };
}

describe("provider dispatch operational names", () => {
  it("fails a primary dispatch before snapshot persistence or SMTP when names cannot load", async () => {
    const { client, rpcCalls } = createDisplayNameFailureClient();
    const originalError = console.error;
    console.error = () => undefined;

    try {
      const result = await executePrimaryProviderDispatch(
        client,
        {
          dispatch_id: "dispatch-1",
          provider_email: "provider@example.test",
          order_ids: ["order-1"],
        },
        {
          providerId: "provider-1",
          deliveryDate: "2026-10-21",
          finalizeRpc: "finalize_provider_primary_order",
          persistSnapshotRpc: "persist_provider_primary_order_email_snapshot",
        },
      );

      assert.deepEqual(result, {
        success: false,
        dispatchId: "dispatch-1",
        error: "Unable to load employee names for provider email.",
      });
      assert.deepEqual(
        rpcCalls.map((call) => call.name),
        ["list_operational_order_display_names", "finalize_provider_primary_order"],
      );
      assert.equal(rpcCalls[1].args.p_success, false);
    } finally {
      console.error = originalError;
    }
  });

  it("fails a supplemental dispatch before SMTP when names cannot load", async () => {
    const { client, rpcCalls } = createDisplayNameFailureClient();
    const originalError = console.error;
    console.error = () => undefined;

    try {
      const result = await executeSupplementalDispatch(
        client,
        {
          dispatch_id: "dispatch-2",
          provider_email: "provider@example.test",
          order_ids: ["order-1"],
        },
        {
          providerId: "provider-1",
          deliveryDate: "2026-10-21",
          finalizeRpc: "finalize_provider_late_order_supplement",
        },
      );

      assert.deepEqual(result, {
        success: false,
        dispatchId: "dispatch-2",
        error: "Unable to load employee names for provider email.",
      });
      assert.deepEqual(
        rpcCalls.map((call) => call.name),
        ["list_operational_order_display_names", "finalize_provider_late_order_supplement"],
      );
      assert.equal(rpcCalls[1].args.p_success, false);
    } finally {
      console.error = originalError;
    }
  });

  it("uses an existing primary email snapshot without re-fetching names", async () => {
    const fromCalls: string[] = [];
    const rpcCalls: RpcCall[] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        throw new Error("Saved snapshots must not query provider or order data.");
      },
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;

    const result = await executePrimaryProviderDispatch(
      client,
      {
        dispatch_id: "dispatch-3",
        provider_email: "provider@example.test",
        order_ids: ["order-1"],
        email_snapshot: {
          providerName: "Provider",
          deliveryDate: "2026-10-21",
          providerGroup: {
            providerId: "provider-1",
            providerName: "Provider",
            totalOrders: 0,
            preparationSections: [],
            offices: [],
          },
        },
      },
      {
        providerId: "provider-1",
        deliveryDate: "2026-10-21",
        finalizeRpc: "finalize_provider_primary_order",
        persistSnapshotRpc: "persist_provider_primary_order_email_snapshot",
        dryRun: true,
      },
    );

    assert.equal(result.success, false);
    assert.deepEqual(fromCalls, []);
    assert.deepEqual(
      rpcCalls.map((call) => call.name),
      ["finalize_provider_primary_order"],
    );
  });
});
