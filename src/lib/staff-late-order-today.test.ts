import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStaffLateOrderDrawerContext,
  collectStaffLateOrderDeliveryDates,
  collectStaffLateOrderDrawerDeliveryDates,
  defaultStaffLateOrderDeliveryDate,
  filterStaffLateOrderForDeliveryDate,
  reconcileStaffLateOrderDeliveryDate,
  staffLateOrderActionLabel,
  staffLateOrderActionKind,
  staffLateOrderCreateAvailable,
  staffLateOrderDrawerTitle,
  staffLateOrderDrawerVisible,
  staffLateOrderNewRequestAvailable,
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
  office_location_id: "loc-1",
  office_location_name: "Camp Road",
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

  it("defaults to Jamaica today when eligible, otherwise earliest date; empty list does not invent today", () => {
    assert.equal(
      defaultStaffLateOrderDeliveryDate([wednesday, tuesday], tuesday),
      tuesday,
    );
    assert.equal(defaultStaffLateOrderDeliveryDate([wednesday], tuesday), wednesday);
    assert.equal(defaultStaffLateOrderDeliveryDate([], tuesday), "");
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
  it("future-only eligible cycle exposes drawer and future create label", () => {
    const full = { eligibleCycles: [cycleFuture], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(full, tuesday);

    assert.equal(drawer.visible, true);
    assert.equal(drawer.defaultDeliveryDate, wednesday);
    assert.equal(staffLateOrderActionLabel(full, tuesday), "Submit late order");
    assert.equal(staffLateOrderDrawerTitle(wednesday, tuesday), "Late order request");
  });

  it("today only -> Submit late order for today", () => {
    const full = { eligibleCycles: [cycleToday], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(full, tuesday);

    assert.equal(drawer.visible, true);
    assert.equal(drawer.defaultDeliveryDate, tuesday);
    assert.equal(staffLateOrderActionLabel(full, tuesday), "Submit late order for today");
    assert.equal(staffLateOrderDrawerTitle(tuesday, tuesday), "Late order for today");
  });

  it("today + future -> today-preferring create label", () => {
    const full = { eligibleCycles: [cycleToday, cycleFuture], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(full, tuesday);

    assert.equal(drawer.visible, true);
    assert.equal(drawer.defaultDeliveryDate, tuesday);
    assert.deepEqual(drawer.deliveryDates, [tuesday, wednesday]);
    assert.equal(staffLateOrderActionLabel(full, tuesday), "Submit late order for today");
  });

  it("status only -> Late order status without submission drawer", () => {
    const full = { eligibleCycles: [], requests: [requestToday] };
    assert.equal(staffLateOrderCreateAvailable(full), false);
    assert.equal(staffLateOrderActionLabel(full, tuesday), "Late order status");
    assert.equal(buildStaffLateOrderDrawerContext(full, tuesday).visible, false);
  });

  it("no eligible cycles and no requests -> hidden unless DB reports new opportunity", () => {
    const empty = { eligibleCycles: [], requests: [] };
    const drawer = buildStaffLateOrderDrawerContext(empty, tuesday);
    assert.equal(staffLateOrderDrawerVisible(drawer.context), false);
    assert.equal(drawer.visible, false);
    assert.equal(staffLateOrderActionLabel(drawer.context, tuesday), null);

    const withOpportunity = buildStaffLateOrderDrawerContext(empty, tuesday, {
      newLateOrderOpportunity: true,
      summary: { available: true, eligibleDeliveryDates: [tuesday] },
    });
    assert.equal(withOpportunity.visible, true);
    assert.equal(withOpportunity.defaultDeliveryDate, tuesday);
    assert.equal(
      staffLateOrderActionLabel(empty, tuesday, {
        newLateOrderOpportunity: true,
        summary: { available: true, eligibleDeliveryDates: [tuesday] },
      }),
      "Submit late order for today",
    );
  });

  it("pre-location summary drives drawer dates when scoped cycles are not loaded yet", () => {
    const empty = { eligibleCycles: [], requests: [] };
    const summaryOpts = { newLateOrderOpportunity: true } as const;

    const futureOnly = buildStaffLateOrderDrawerContext(empty, tuesday, {
      ...summaryOpts,
      summary: { available: true, eligibleDeliveryDates: [wednesday] },
    });
    assert.equal(futureOnly.defaultDeliveryDate, wednesday);
    assert.deepEqual(futureOnly.deliveryDates, [wednesday]);
    assert.equal(staffLateOrderDrawerTitle(futureOnly.defaultDeliveryDate, tuesday), "Late order request");

    const todayOnly = buildStaffLateOrderDrawerContext(empty, tuesday, {
      ...summaryOpts,
      summary: { available: true, eligibleDeliveryDates: [tuesday] },
    });
    assert.equal(todayOnly.defaultDeliveryDate, tuesday);
    assert.equal(staffLateOrderDrawerTitle(todayOnly.defaultDeliveryDate, tuesday), "Late order for today");

    const todayAndFuture = buildStaffLateOrderDrawerContext(empty, tuesday, {
      ...summaryOpts,
      summary: { available: true, eligibleDeliveryDates: [wednesday, tuesday] },
    });
    assert.equal(todayAndFuture.defaultDeliveryDate, tuesday);

    const noSummaryDates = buildStaffLateOrderDrawerContext(empty, tuesday, {
      newLateOrderOpportunity: false,
      summary: { available: false, eligibleDeliveryDates: [] },
    });
    assert.equal(noSummaryDates.defaultDeliveryDate, "");
    assert.deepEqual(noSummaryDates.deliveryDates, []);
  });

  it("loaded location-scoped cycles override pre-location summary dates", () => {
    const summaryFuture = { available: true, eligibleDeliveryDates: [wednesday] };
    const preLocation = collectStaffLateOrderDrawerDeliveryDates(
      { eligibleCycles: [], requests: [] },
      { newLateOrderOpportunity: true, summary: summaryFuture },
    );
    assert.deepEqual(preLocation, [wednesday]);

    const withScopedToday = collectStaffLateOrderDrawerDeliveryDates(
      { eligibleCycles: [cycleToday], requests: [] },
      { newLateOrderOpportunity: true, summary: summaryFuture },
    );
    assert.deepEqual(withScopedToday, [tuesday]);

    const drawer = buildStaffLateOrderDrawerContext(
      { eligibleCycles: [cycleToday], requests: [] },
      tuesday,
      { newLateOrderOpportunity: true, summary: summaryFuture },
    );
    assert.equal(drawer.defaultDeliveryDate, tuesday);
    assert.deepEqual(drawer.deliveryDates, [tuesday]);

    const serverScopedEmpty = collectStaffLateOrderDrawerDeliveryDates(
      { eligibleCycles: [], requests: [] },
      {
        newLateOrderOpportunity: true,
        summary: summaryFuture,
        preLocationOnly: false,
      },
    );
    assert.deepEqual(serverScopedEmpty, []);
  });

  it("reconciles delivery date when location changes invalidate the current date", () => {
    assert.equal(
      reconcileStaffLateOrderDeliveryDate([wednesday], tuesday, tuesday),
      wednesday,
    );
    assert.equal(
      reconcileStaffLateOrderDeliveryDate([tuesday, wednesday], tuesday, wednesday),
      wednesday,
    );
    assert.equal(
      reconcileStaffLateOrderDeliveryDate([], tuesday, wednesday),
      wednesday,
    );
  });

  it("new request availability combines loaded cycles and authoritative RPC flag", () => {
    const empty = { eligibleCycles: [], requests: [] };
    assert.equal(staffLateOrderNewRequestAvailable(empty, false), false);
    assert.equal(staffLateOrderNewRequestAvailable(empty, true), true);
    assert.equal(
      staffLateOrderNewRequestAvailable({ eligibleCycles: [cycleToday], requests: [] }, false),
      true,
    );
  });

  it("status only when DB reports no actionable opportunity and cycles are blocked", () => {
    const blockedAll = {
      eligibleCycles: [],
      requests: [requestToday],
    };
    assert.equal(staffLateOrderActionKind(blockedAll, { newLateOrderOpportunity: false }), "status");
    assert.equal(
      staffLateOrderActionLabel(blockedAll, tuesday, { newLateOrderOpportunity: false }),
      "Late order status",
    );
    assert.equal(staffLateOrderDrawerVisible(blockedAll, { newLateOrderOpportunity: false }), false);
  });

  it("submit remains when another provider cycle is still actionable", () => {
    const partial = {
      eligibleCycles: [cycleFuture],
      requests: [requestToday],
    };
    assert.equal(staffLateOrderActionKind(partial, { newLateOrderOpportunity: false }), "submit");
    assert.equal(staffLateOrderDrawerVisible(partial, { newLateOrderOpportunity: false }), true);
  });
});
