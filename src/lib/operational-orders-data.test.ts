import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadOperationalOrderDisplayNames,
  OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE,
  OPERATIONAL_ORDERS_SELECT,
  OperationalOrderDisplayNamesError,
  parseOperationalOrderRows,
  type OperationalOrderRow,
} from "./operational-orders-data";

function createRpcClient(
  responder: (ids: string[]) => Promise<{
    data: Array<{
      order_id: string;
      employee_name: string | null;
      late_order_created_by_name: string | null;
    }> | null;
    error: null | { message: string; code: string; details: string; hint: string };
  }>,
): SupabaseClient {
  return {
    rpc: async (name: string, args: { p_order_ids: string[] }) => {
      assert.equal(name, "list_operational_order_display_names");
      return responder(args.p_order_ids);
    },
  } as unknown as SupabaseClient;
}

function buildOrderRow(id: string): OperationalOrderRow {
  return {
    id,
    profile_id: "profile-1",
    status: "submitted",
    delivery_state: "pending",
    financial_disposition: "active",
    delivery_issue_type: null,
    delivery_resolution_type: null,
    actual_delivery_date: null,
    lunch_day_id: "lunch-day-1",
    created_at: "2026-10-20T12:00:00.000Z",
    updated_at: "2026-10-20T12:00:00.000Z",
    special_instructions: null,
    meal_quantity: 1,
    is_late_order: false,
    office_location_name: "Kingston",
    office_location_address: null,
    order_delivery_reconciliation: null,
    lunch_days: {
      lunch_date: "2026-10-21",
      order_date: "2026-10-20",
      provider_id: "provider-1",
      lunch_providers: { id: "provider-1", name: "Provider" },
    },
    order_items: [],
  };
}

describe("operational order display names", () => {
  it("does not embed profile records in the shared operational order query", () => {
    assert.doesNotMatch(OPERATIONAL_ORDERS_SELECT, /profiles\s*!?/);
    assert.match(OPERATIONAL_ORDERS_SELECT, /order_delivery_reconciliation/);
  });

  it("hydrates the shared operational views with the batched display-name loader", () => {
    const sharedConsumers = [
      "../app/admin/todays-orders/page.tsx",
      "../app/admin/deliveries/page.tsx",
      "../app/admin/deliveries/load-data.ts",
      "../app/admin/deliveries/print/page.tsx",
      "../app/admin/deliveries/provider/[providerId]/print/page.tsx",
      "../app/admin/orders/page.tsx",
      "../app/admin/orders/load-employee-recent-orders.ts",
      "../app/admin/orders/provider/[providerId]/print/page.tsx",
    ];

    for (const relativePath of sharedConsumers) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      assert.match(source, /parseOperationalOrderRows\s*\(/, relativePath);
      assert.doesNotMatch(source, /profiles![\s\S]*full_name/, relativePath);
    }

    const lateOrders = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(lateOrders, /loadOperationalOrderDisplayNames\s*\(/);
    assert.doesNotMatch(lateOrders, /profiles![\s\S]*full_name/);
  });

  it("does not call the RPC for an empty order list", async () => {
    let calls = 0;
    const client = createRpcClient(async () => {
      calls += 1;
      return { data: [], error: null };
    });

    const result = await loadOperationalOrderDisplayNames(client, [], "test");

    assert.equal(calls, 0);
    assert.equal(result.size, 0);
  });

  it("deduplicates and safely batches large order sets", async () => {
    const uniqueIds = Array.from({ length: 401 }, (_, index) => `order-${index}`);
    const batches: string[][] = [];
    const client = createRpcClient(async (ids) => {
      batches.push(ids);
      return {
        data: ids.map((id) => ({
          order_id: id,
          employee_name: `Employee ${id}`,
          late_order_created_by_name: null,
        })),
        error: null,
      };
    });

    const result = await loadOperationalOrderDisplayNames(
      client,
      [...uniqueIds, uniqueIds[0]],
      "test",
    );

    assert.deepEqual(
      batches.map((batch) => batch.length),
      [
        OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE,
        OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE,
        1,
      ],
    );
    assert.equal(result.size, 401);
  });

  it("uses current names and explicit fallbacks for returned blank names", async () => {
    const client = createRpcClient(async (ids) => ({
      data: ids.map((id, index) => ({
        order_id: id,
        employee_name: index === 0 ? "  Current Owner Name  " : "   ",
        late_order_created_by_name: index === 0 ? "  HR Creator  " : null,
      })),
      error: null,
    }));

    const orders = await parseOperationalOrderRows(
      client,
      [buildOrderRow("order-1"), buildOrderRow("order-2")],
      "test",
    );

    assert.equal(orders[0].employeeName, "Current Owner Name");
    assert.equal(orders[0].lateOrderCreatedByName, "HR Creator");
    assert.equal(orders[1].employeeName, "Unnamed employee");
    assert.equal(orders[1].lateOrderCreatedByName, null);
  });

  it("fails closed when an expected order-name row is missing", async () => {
    const client = createRpcClient(async (ids) => ({
      data: ids.slice(0, 1).map((id) => ({
        order_id: id,
        employee_name: "Employee",
        late_order_created_by_name: null,
      })),
      error: null,
    }));
    const originalError = console.error;
    console.error = () => undefined;

    try {
      await assert.rejects(
        loadOperationalOrderDisplayNames(client, ["order-1", "order-2"], "test"),
        OperationalOrderDisplayNamesError,
      );
    } finally {
      console.error = originalError;
    }
  });

  it("fails closed when the authorized RPC fails", async () => {
    const client = createRpcClient(async () => ({
      data: null,
      error: { message: "denied", code: "42501", details: "", hint: "" },
    }));
    const originalError = console.error;
    console.error = () => undefined;

    try {
      await assert.rejects(
        loadOperationalOrderDisplayNames(client, ["order-1"], "test"),
        OperationalOrderDisplayNamesError,
      );
    } finally {
      console.error = originalError;
    }
  });
});
