import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStaffLateOrderDrawerContext,
  collectStaffLateOrderDeliveryDates,
  defaultStaffLateOrderDeliveryDate,
  filterStaffLateOrderForDeliveryDate,
  staffLateOrderCreateAvailable,
  staffLateOrderDrawerTitle,
  staffLateOrderDrawerVisible,
  staffLateOrderTriggerLabel,
} from "./staff-late-order-today";

const tuesday = "2099-01-07";
const wednesday = "2099-01-08";

const cycleToday = {
  provider_id: "p1",
  provider_name: "A",
  order_date: "2099-01-06",
  scheduled_delivery_date: tuesday,
};

const cycleFuture = {
  provider_id: "p2",
  provider_name: "B",
  order_date: tuesday,
  scheduled_delivery_date: wednesday,
};

const requestToday = {
  id: "r1",
  provider_id: "p1",
  provider_name: "A",
  order_date: "2099-01-06",
  scheduled_delivery_date: tuesday,
  status: "pending" as const,
  requested_summary: "Salad",
  quantity: 1,
  special_instructions: null,
  decline_reason: null,
  fulfilled_order_id: null,
  created_at: "",
  updated_at: "",
};

describe("staff late order delivery helpers", () => {
  it("collects distinct sorted delivery dates from cycles and requests", () => {
    const dates = collectStaffLateOrderDeliveryDates({
      eligibleCycles: [cycleFuture, cycleToday],
      requests: [requestToday],
    });
    assert.deepEqual(dates, [tuesday, wednesday]);
  });

  it("defaults to Jamaica today when eligible, otherwise earliest date", () => {
    assert.equal(
      defaultStaffLateOrderDeliveryDate([wednesday, tuesday], tuesday),
      tuesday,
    );
    assert.equal(defaultStaffLateOrderDeliveryDate([wednesday], tuesday), wednesday);
  });

  it("filters providers and requests for a selected delivery date", () => {
    const scoped = filterStaffLateOrderForDeliveryDate(
      { eligibleCycles: [cycleToday, cycleFuture], requests: [requestToday] },
      wednesday,
    );
    assert.equal(scoped.eligibleCycles.length, 1);
    assert.equal(scoped.eligibleCycles[0]?.provider_id, "p2");
    assert.equal(scoped.requests.length, 0);
  });
});

describe("staff late order drawer context", () => {
  it("Tuesday repro: future-only eligible cycle exposes drawer and Late order label", () => {
    const full = { eligibleCycles: [cycleFuture], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(full, tuesday);

    assert.equal(drawer.visible, true);
    assert.equal(drawer.context.eligibleCycles.length, 1);
    assert.equal(drawer.defaultDeliveryDate, wednesday);
    assert.equal(drawer.deliveryDates.length, 1);
    assert.equal(staffLateOrderTriggerLabel(full, tuesday), "Late order");
    assert.equal(staffLateOrderDrawerTitle(wednesday, tuesday), "Late order request");
  });

  it("today only -> Late order for today", () => {
    const full = { eligibleCycles: [cycleToday], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(full, tuesday);

    assert.equal(drawer.visible, true);
    assert.equal(drawer.defaultDeliveryDate, tuesday);
    assert.equal(staffLateOrderTriggerLabel(full, tuesday), "Late order for today");
    assert.equal(staffLateOrderDrawerTitle(tuesday, tuesday), "Late order for today");
  });

  it("today + future -> Late orders with today default", () => {
    const full = { eligibleCycles: [cycleToday, cycleFuture], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(full, tuesday);

    assert.equal(drawer.visible, true);
    assert.equal(drawer.defaultDeliveryDate, tuesday);
    assert.deepEqual(drawer.deliveryDates, [tuesday, wednesday]);
    assert.equal(staffLateOrderTriggerLabel(full, tuesday), "Late orders");
  });

  it("future only with no create on today still lists future provider when scoped", () => {
    const drawer = buildStaffLateOrderDrawerContext(
      { eligibleCycles: [cycleFuture], requests: [] },
      tuesday,
    );
    const wednesdayScope = filterStaffLateOrderForDeliveryDate(drawer.context, wednesday);
    assert.equal(staffLateOrderCreateAvailable(wednesdayScope), true);
    assert.equal(wednesdayScope.eligibleCycles[0]?.provider_name, "B");
  });

  it("status only -> Late order status", () => {
    const full = { eligibleCycles: [], requests: [requestToday] };
    assert.equal(staffLateOrderCreateAvailable(full), false);
    assert.equal(staffLateOrderTriggerLabel(full, tuesday), "Late order status");
    assert.equal(buildStaffLateOrderDrawerContext(full, tuesday).visible, true);
  });

  it("no eligible cycles and no requests -> hidden drawer", () => {
    const drawer = buildStaffLateOrderDrawerContext({ eligibleCycles: [], requests: [] }, tuesday);
    assert.equal(staffLateOrderDrawerVisible(drawer.context), false);
    assert.equal(drawer.visible, false);
    assert.equal(staffLateOrderTriggerLabel(drawer.context, tuesday), null);
  });

  it("closed ordering + eligible -> prominent request label", () => {
    const full = { eligibleCycles: [cycleFuture], requests: [] };
    assert.equal(
      staffLateOrderTriggerLabel(full, tuesday, { orderingOpen: false, prominent: true }),
      "Request a late order",
    );
  });

  it("normal ordering open + today late eligible -> create available", () => {
    const drawer = buildStaffLateOrderDrawerContext({ eligibleCycles: [cycleToday], requests: [] }, tuesday);
    assert.equal(staffLateOrderCreateAvailable(drawer.context), true);
    assert.equal(
      staffLateOrderTriggerLabel(drawer.context, tuesday, { orderingOpen: true }),
      "Late order for today",
    );
  });
});
