import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStaffLateOrderDrawerContext,
  filterStaffLateOrderForJamaicaToday,
  staffLateOrderCreateAvailable,
  staffLateOrderDrawerVisible,
  staffLateOrderTriggerLabel,
} from "./staff-late-order-today";

const today = "2099-01-06";
const future = "2099-01-07";

const cycleToday = {
  provider_id: "p1",
  provider_name: "A",
  order_date: "2099-01-05",
  scheduled_delivery_date: today,
};

const cycleFuture = {
  provider_id: "p2",
  provider_name: "B",
  order_date: "2099-01-06",
  scheduled_delivery_date: future,
};

const requestToday = {
  id: "r1",
  provider_id: "p1",
  provider_name: "A",
  order_date: "2099-01-05",
  scheduled_delivery_date: today,
  status: "pending" as const,
  requested_summary: "Salad",
  quantity: 1,
  special_instructions: null,
  decline_reason: null,
  fulfilled_order_id: null,
  created_at: "",
  updated_at: "",
};

describe("staff late order today helpers", () => {
  it("narrows RPC payload to Jamaica today only", () => {
    const full = {
      eligibleCycles: [cycleToday, cycleFuture],
      requests: [requestToday],
    };

    const narrowed = filterStaffLateOrderForJamaicaToday(full, today);
    assert.equal(narrowed.eligibleCycles.length, 1);
    assert.equal(narrowed.eligibleCycles[0]?.provider_id, "p1");
    assert.equal(narrowed.requests.length, 1);
  });

  it("today eligible -> Late order for today trigger", () => {
    const ctx = filterStaffLateOrderForJamaicaToday({ eligibleCycles: [cycleToday], requests: [] }, today);
    assert.equal(staffLateOrderTriggerLabel(ctx), "Late order for today");
    assert.equal(staffLateOrderTriggerLabel(ctx, { orderingOpen: true }), "Late order for today");
  });

  it("today status only -> Late order status trigger", () => {
    const ctx = filterStaffLateOrderForJamaicaToday({ eligibleCycles: [], requests: [requestToday] }, today);
    assert.equal(staffLateOrderCreateAvailable(ctx), false);
    assert.equal(staffLateOrderTriggerLabel(ctx), "Late order status");
  });

  it("future eligible only -> no same-day drawer", () => {
    const drawer = buildStaffLateOrderDrawerContext(
      { eligibleCycles: [cycleFuture], requests: [] },
      today,
    );
    assert.equal(drawer.visible, false);
    assert.equal(staffLateOrderTriggerLabel(drawer.context), null);
  });

  it("today + future eligible -> drawer shows today only", () => {
    const drawer = buildStaffLateOrderDrawerContext(
      { eligibleCycles: [cycleToday, cycleFuture], requests: [] },
      today,
    );
    assert.equal(drawer.visible, true);
    assert.equal(drawer.deliveryDate, today);
    assert.equal(drawer.context.eligibleCycles.length, 1);
    assert.equal(drawer.context.eligibleCycles[0]?.scheduled_delivery_date, today);
  });

  it("normal ordering open + today late eligible -> create available", () => {
    const drawer = buildStaffLateOrderDrawerContext({ eligibleCycles: [cycleToday], requests: [] }, today);
    assert.equal(drawer.visible, true);
    assert.equal(staffLateOrderCreateAvailable(drawer.context), true);
    assert.equal(
      staffLateOrderTriggerLabel(drawer.context, { orderingOpen: true }),
      "Late order for today",
    );
  });

  it("closed + today late eligible -> prominent request action label", () => {
    const drawer = buildStaffLateOrderDrawerContext({ eligibleCycles: [cycleToday], requests: [] }, today);
    assert.equal(
      staffLateOrderTriggerLabel(drawer.context, { orderingOpen: false, prominent: true }),
      "Request a late order",
    );
  });

  it("no today eligibility or status -> no drawer", () => {
    const drawer = buildStaffLateOrderDrawerContext(
      { eligibleCycles: [cycleFuture], requests: [] },
      today,
    );
    assert.equal(staffLateOrderDrawerVisible(drawer.context), false);
    assert.equal(drawer.visible, false);
  });
});
