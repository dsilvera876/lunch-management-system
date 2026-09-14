import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildSentLateOrderDispatchMap,
  countEligibleLateOrdersForSupplementSend,
  formatLateOrderRowDispatchLabel,
  resolveLateOrderRowDispatchDisplay,
} from "./late-order-per-order-status";

describe("late-order per-order dispatch status", () => {
  it("marks orders sent only when linked to a sent dispatch", () => {
    const sentByOrderId = buildSentLateOrderDispatchMap([
      { orderId: "o1", dispatchStatus: "sent", sentAt: "2026-09-10T17:08:00Z" },
      { orderId: "o2", dispatchStatus: "failed", sentAt: null },
    ]);

    assert.equal(sentByOrderId.has("o1"), true);
    assert.equal(sentByOrderId.has("o2"), false);

    assert.equal(
      resolveLateOrderRowDispatchDisplay("o1", sentByOrderId, []).kind,
      "sent",
    );
    assert.equal(
      resolveLateOrderRowDispatchDisplay("o3", sentByOrderId, []).kind,
      "approved_unsent",
    );
  });

  it("keeps first batch sent while second order stays unsent until its dispatch sends", () => {
    const sentByOrderId = buildSentLateOrderDispatchMap([
      { orderId: "batch-1", dispatchStatus: "sent", sentAt: "2026-09-10T17:00:00Z" },
    ]);

    assert.equal(
      resolveLateOrderRowDispatchDisplay("batch-1", sentByOrderId, []).kind,
      "sent",
    );
    assert.equal(
      resolveLateOrderRowDispatchDisplay("batch-2", sentByOrderId, []).kind,
      "approved_unsent",
    );

    const afterSecondSend = buildSentLateOrderDispatchMap([
      { orderId: "batch-1", dispatchStatus: "sent", sentAt: "2026-09-10T17:00:00Z" },
      { orderId: "batch-2", dispatchStatus: "sent", sentAt: "2026-09-10T17:08:00Z" },
    ]);

    assert.equal(
      resolveLateOrderRowDispatchDisplay("batch-1", afterSecondSend, []).kind,
      "sent",
    );
    assert.equal(
      resolveLateOrderRowDispatchDisplay("batch-2", afterSecondSend, []).kind,
      "sent",
    );
  });

  it("does not treat failed or attention dispatches as sent", () => {
    const sentByOrderId = buildSentLateOrderDispatchMap([]);

    assert.equal(
      resolveLateOrderRowDispatchDisplay("o1", sentByOrderId, [
        {
          status: "attention_required",
          messageMetadata: { order_ids: ["o1"] },
        },
      ]).kind,
      "attention_required",
    );

    assert.equal(
      resolveLateOrderRowDispatchDisplay("o2", sentByOrderId, [
        {
          status: "failed",
          messageMetadata: { order_ids: ["o2"] },
        },
      ]).kind,
      "failed",
    );

    assert.equal(formatLateOrderRowDispatchLabel({ kind: "attention_required" }), "Needs review");
    assert.equal(formatLateOrderRowDispatchLabel({ kind: "failed" }), "Send failed");
  });

  it("counts only send-eligible orders for the provider outstanding total", () => {
    const sentByOrderId = buildSentLateOrderDispatchMap([
      { orderId: "a", dispatchStatus: "sent", sentAt: "2026-09-10T17:00:00Z" },
    ]);

    assert.equal(
      countEligibleLateOrdersForSupplementSend(["a", "b", "c"], sentByOrderId, []),
      2,
    );

    const dispatches = [
      { status: "pending", messageMetadata: { order_ids: ["b"] } },
      { status: "attention_required", messageMetadata: { order_ids: ["c"] } },
      { status: "failed", messageMetadata: { order_ids: ["f"] } },
    ];

    assert.equal(
      countEligibleLateOrdersForSupplementSend(
        ["a", "b", "c", "f", "ready"],
        sentByOrderId,
        dispatches,
      ),
      2,
      "failed and never-dispatched orders count; pending and attention do not",
    );
  });

  it("uses eligible count on the late orders page loader", () => {
    const pageSource = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /countEligibleLateOrdersForSupplementSend/);
  });

  it("loads all sent dispatch memberships on the late orders page", () => {
    const pageSource = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(pageSource, /provider_late_order_dispatch_orders[\s\S]*?\.limit\(1\)/);
    assert.match(pageSource, /buildSentLateOrderDispatchMap/);
  });
});
