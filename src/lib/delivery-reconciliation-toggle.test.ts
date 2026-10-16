import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  finishDeliveryToggle,
  prepareDeliveryToggle,
  type DeliveryToggleMutationResult,
} from "./delivery-reconciliation-toggle";
import { patchFromDelivered, type DeliveryOrderPatch } from "./deliveries";
import type { OperationalOrder } from "./operational-orders";
import { DELIVERY_TOGGLE_ERROR_MESSAGE } from "./deliveries-presentation";

function pendingOrder(id: string, employeeName: string): OperationalOrder {
  return {
    id,
    employeeName,
    profileId: "profile-1",
    providerName: "Test Provider",
    providerId: "provider-1",
    lunchDayId: "lunch-day-1",
    officeLocationName: "Camp Road",
    status: "submitted",
    deliveryState: "pending",
    financialDisposition: "chargeable",
    actualDeliveryDate: null,
    deliveryIssueType: null,
    deliveryResolutionType: null,
    hrDeliveryNotes: null,
    isLateOrder: false,
    specialInstructions: null,
    mealQuantity: 1,
    items: [],
    createdAt: "2026-10-13T12:00:00.000Z",
    updatedAt: "2026-10-13T12:00:00.000Z",
    officeLocationAddress: null,
    orderDate: "2026-10-12",
    deliveryDate: "2026-10-13",
    lateOrderCreatedByName: null,
    lateOrderDispatched: false,
  };
}

describe("delivery reconciliation action orchestration", () => {
  it("keeps pending orders unchanged until server confirmation", () => {
    const deliveryDate = "2026-10-13";
    const orders = [
      pendingOrder("o1", "Staff One"),
      pendingOrder("o2", "Staff Two"),
      pendingOrder("o3", "Staff Three"),
      pendingOrder("o4", "Staff Four"),
    ];

    const inFlight = new Set<string>();
    const flights: Array<{
      version: number;
      rollbackSnapshot: DeliveryOrderPatch;
      result: DeliveryToggleMutationResult;
    }> = [];

    for (const order of orders) {
      const prepared = prepareDeliveryToggle(orders, order.id, inFlight);
      assert.equal(prepared.kind, "ready");
      inFlight.add(order.id);
      flights.push({
        version: 1,
        rollbackSnapshot: prepared.rollbackSnapshot,
        result: {
          success: true,
          patch: patchFromDelivered(order, deliveryDate),
        },
      });
    }

    assert.equal(
      orders.filter((entry) => entry.deliveryState === "pending").length,
      4,
      "orders remain pending until mutations finish",
    );

    let nextOrders = orders;
    for (const flight of flights) {
      const finished = finishDeliveryToggle(
        nextOrders,
        flight.version,
        flight.version,
        flight.rollbackSnapshot,
        flight.result,
        DELIVERY_TOGGLE_ERROR_MESSAGE,
      );
      nextOrders = finished.orders;
      assert.equal(finished.rowError, null);
      assert.equal(finished.successMessage, "Delivery confirmed.");
    }

    assert.deepEqual(
      nextOrders.map((entry) => entry.deliveryState),
      ["delivered", "delivered", "delivered", "delivered"],
    );
  });

  it("blocks duplicate submissions while an order is in flight", () => {
    const order = pendingOrder("o1", "Staff One");
    const inFlight = new Set<string>();

    assert.equal(prepareDeliveryToggle([order], order.id, inFlight).kind, "ready");
    inFlight.add(order.id);
    assert.equal(prepareDeliveryToggle([order], order.id, inFlight).kind, "busy");
  });

  it("rolls back one failed mutation without undoing other delivered orders", () => {
    const deliveryDate = "2026-10-13";
    const first = pendingOrder("o1", "Staff One");
    const second = pendingOrder("o2", "Staff Two");

    let orders = [first, second];
    const firstPrepared = prepareDeliveryToggle(orders, first.id, new Set());
    assert.equal(firstPrepared.kind, "ready");

    const secondPrepared = prepareDeliveryToggle(orders, second.id, new Set());
    assert.equal(secondPrepared.kind, "ready");

    const firstOk = finishDeliveryToggle(
      orders,
      1,
      1,
      firstPrepared.rollbackSnapshot,
      { success: true, patch: patchFromDelivered(first, deliveryDate) },
      DELIVERY_TOGGLE_ERROR_MESSAGE,
    );
    orders = firstOk.orders;

    const secondFailed = finishDeliveryToggle(
      orders,
      1,
      1,
      secondPrepared.rollbackSnapshot,
      { success: false, error: "Only pending deliveries can be marked delivered" },
      DELIVERY_TOGGLE_ERROR_MESSAGE,
    );
    orders = secondFailed.orders;

    assert.equal(secondFailed.rowError, DELIVERY_TOGGLE_ERROR_MESSAGE);
    assert.equal(orders.find((entry) => entry.id === "o1")?.deliveryState, "delivered");
    assert.equal(orders.find((entry) => entry.id === "o2")?.deliveryState, "pending");
  });

  it("does not apply stale mutation results after a newer toggle generation", () => {
    const deliveryDate = "2026-10-13";
    const order = pendingOrder("o1", "Staff One");
    const orders = [order];

    const deliverPrepared = prepareDeliveryToggle(orders, order.id, new Set());
    assert.equal(deliverPrepared.kind, "ready");

    const staleDeliverSuccess = finishDeliveryToggle(
      orders,
      1,
      2,
      deliverPrepared.rollbackSnapshot,
      { success: true, patch: patchFromDelivered(order, deliveryDate) },
      DELIVERY_TOGGLE_ERROR_MESSAGE,
    );

    assert.equal(staleDeliverSuccess.orders[0]?.deliveryState, "pending");
    assert.equal(staleDeliverSuccess.rowError, null);
  });
});
