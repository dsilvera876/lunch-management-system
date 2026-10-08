import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  staffLateOrderActionLabel,
  staffLateOrderCreateActionLabel,
  type StaffLateOrderNewRequestSummary,
} from "./staff-late-order-today";

const jamaicaToday = "2099-01-07";
const futureDate = "2099-01-08";

const emptyContext = { eligibleCycles: [], requests: [] };

const summaryToday: StaffLateOrderNewRequestSummary = {
  available: true,
  eligibleDeliveryDates: [jamaicaToday],
};

const summaryFuture: StaffLateOrderNewRequestSummary = {
  available: true,
  eligibleDeliveryDates: [futureDate],
};

describe("staff late-order flow labels (A–G)", () => {
  it("A: no default + same-day opportunity uses stable today label from summary", () => {
    assert.equal(
      staffLateOrderActionLabel(emptyContext, jamaicaToday, {
        newLateOrderOpportunity: true,
        summary: summaryToday,
      }),
      "Submit late order for today",
    );
  });

  it("G: label unchanged after location would load scoped cycles for today", () => {
    const withScopedCycles = {
      eligibleCycles: [
        {
          provider_id: "p1",
          provider_name: "Provider",
          order_date: "2099-01-06",
          scheduled_delivery_date: jamaicaToday,
        },
      ],
      requests: [],
    };

    const before = staffLateOrderActionLabel(emptyContext, jamaicaToday, {
      newLateOrderOpportunity: true,
      summary: summaryToday,
    });
    const after = staffLateOrderActionLabel(withScopedCycles, jamaicaToday, {
      newLateOrderOpportunity: true,
      summary: summaryToday,
    });

    assert.equal(before, after);
    assert.equal(before, "Submit late order for today");
  });

  it("D: future-only opportunity label", () => {
    assert.equal(
      staffLateOrderActionLabel(emptyContext, jamaicaToday, {
        newLateOrderOpportunity: true,
        summary: summaryFuture,
      }),
      "Submit late order",
    );
  });

  it("E: status-only label", () => {
    assert.equal(
      staffLateOrderActionLabel(
        {
          eligibleCycles: [],
          requests: [
            {
              id: "r1",
              provider_id: "p1",
              provider_name: "A",
              order_date: "2099-01-06",
              scheduled_delivery_date: jamaicaToday,
              status: "pending",
              requested_summary: "Meal",
              quantity: 1,
              special_instructions: null,
              decline_reason: null,
              fulfilled_order_id: null,
              office_location_id: "loc-1",
              office_location_name: "Camp Road",
              created_at: "",
              updated_at: "",
            },
          ],
        },
        jamaicaToday,
        { newLateOrderOpportunity: false },
      ),
      "Late order status",
    );
  });

  it("F: no opportunity or status hides action", () => {
    assert.equal(
      staffLateOrderActionLabel(emptyContext, jamaicaToday, {
        newLateOrderOpportunity: false,
      }),
      null,
    );
  });

  it("createActionLabel never returns bare Late order", () => {
    assert.equal(staffLateOrderCreateActionLabel([futureDate], jamaicaToday), "Submit late order");
    assert.equal(
      staffLateOrderCreateActionLabel([jamaicaToday], jamaicaToday),
      "Submit late order for today",
    );
  });
});

describe("staff late-order routing guards", () => {
  it("B/C: lunch defers normal location popover when lateOrder=1", () => {
    const lunchPage = readFileSync("src/app/lunch/page.tsx", "utf8");
    assert.match(lunchPage, /deferInitialLocationPicker=\{params\.lateOrder === "1"\}/);
    assert.doesNotMatch(lunchPage, /My orders/);
    assert.doesNotMatch(lunchPage, /StaffLateOrderDrawerRoot[\s\S]*key=\{defaultOfficeLocationId/);
  });

  it("late-order drawer opens from query regardless of orderingOpen", () => {
    const drawer = readFileSync("src/components/lunch/staff-late-order-drawer.tsx", "utf8");
    assert.match(
      drawer,
      /highlightFromQuery &&\s*\n\s*staffLateOrderNewRequestAvailable/,
    );
    assert.doesNotMatch(drawer, /highlightFromQuery &&\s*\n\s*!orderingOpen/);
  });

  it("drawer shows submission form without drawer-only request toggle", () => {
    const panel = readFileSync("src/components/lunch/staff-late-order-request-panel.tsx", "utf8");
    assert.doesNotMatch(panel, /Close request form/);
    assert.match(panel, /Submit late order/);
  });
});
