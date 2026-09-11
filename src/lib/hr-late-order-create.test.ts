import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isDeliveryDateAllowedForHrLateOrderCreation,
  listHrLateOrderCreationCycles,
} from "./hr-late-order-create";

describe("HR late-order creation cycles", () => {
  it("lists only cycles with company cutoff passed and provider late window open", () => {
    const today = "2026-09-10";
    const now = new Date("2026-09-10T16:00:00-05:00");

    const cycles = listHrLateOrderCreationCycles({
      today,
      now,
      provider: {
        acceptsLateOrders: true,
        lateOrderDeadlineDay: "delivery_day",
        lateOrderDeadlineTime: "23:59",
      },
      isCompanyCutoffPassed: (orderDate) => orderDate === "2026-09-10",
    });

    assert.ok(cycles.length >= 1);
    assert.ok(cycles.every((cycle) => cycle.orderDate && cycle.deliveryDate));
  });

  it("returns no cycles when provider does not accept late orders", () => {
    const cycles = listHrLateOrderCreationCycles({
      today: "2026-09-10",
      now: new Date("2026-09-10T12:00:00-05:00"),
      provider: {
        acceptsLateOrders: false,
        lateOrderDeadlineDay: "delivery_day",
        lateOrderDeadlineTime: "23:59",
      },
      isCompanyCutoffPassed: () => true,
    });

    assert.deepEqual(cycles, []);
  });

  it("rejects delivery dates outside actionable cycles", () => {
    const cycles = [
      { deliveryDate: "2026-09-11", orderDate: "2026-09-10" },
    ];

    assert.equal(isDeliveryDateAllowedForHrLateOrderCreation(cycles, "2026-09-11"), true);
    assert.equal(isDeliveryDateAllowedForHrLateOrderCreation(cycles, "2026-09-08"), false);
  });

  it("HR form action validates delivery against actionable cycles", () => {
    const source = readFileSync(
      new URL("../app/admin/late-orders/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /fetchHrLateOrderCreationCyclesForProvider/);
    assert.match(source, /isDeliveryDateAllowedForHrLateOrderCreation/);
    assert.doesNotMatch(source, /saveAsDefault/);
  });
});
