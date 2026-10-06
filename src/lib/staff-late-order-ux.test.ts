import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("staff late order UX", () => {
  it("dashboard state matrix covers open, late eligible, existing request, and fully closed", () => {
    const dashboard = readFileSync(
      new URL("../components/dashboard/staff-dashboard.tsx", import.meta.url),
      "utf8",
    );

    assert.match(dashboard, /orderingOpen \?/);
    assert.match(dashboard, /lateOrderTodayAvailable/);
    assert.match(dashboard, /lateOrderSecondaryLabel/);
    assert.match(dashboard, /lateOrderRequestAvailable \?/);
    assert.match(dashboard, /hasLateOrderRequests \?/);
    assert.match(dashboard, /Lunch Ordering Closed/);
    assert.match(dashboard, /disabled/);
  });

  it("Today's Order uses drawer triggers instead of inline late-order panel", () => {
    const lunch = readFileSync(new URL("../app/lunch/page.tsx", import.meta.url), "utf8");
    const drawer = readFileSync(
      new URL("../components/lunch/staff-late-order-drawer.tsx", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("../components/lunch/staff-late-order-request-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(lunch, /StaffLateOrderDrawerRoot/);
    assert.match(lunch, /StaffLateOrderDrawerTrigger/);
    assert.match(lunch, /buildStaffLateOrderDrawerContext/);
    assert.match(lunch, /defaultDeliveryDate/);
    assert.match(lunch, /deliveryDates/);
    assert.doesNotMatch(lunch, /StaffLateOrderRequestSection/);
    assert.match(drawer, /FocusTrapPopover/);
    assert.match(drawer, /aria-label="Close late order drawer"/);
    assert.match(drawer, /staffLateOrderDrawerTitle/);
    assert.match(drawer, /Delivery date/);
    assert.match(drawer, /filterStaffLateOrderForDeliveryDate/);
    assert.match(drawer, /deliveryDates\.length > 1/);
    assert.match(drawer, /key=\{selectedDeliveryDate\}/);
    assert.doesNotMatch(panel, /type="date"|delivery date selector/i);
    assert.match(panel, /const showEntry = eligibleCycles\.length > 0/);
    assert.match(drawer, /variant="drawer"/);
  });

  it("late-order panel keeps badges, helper copy, and optimistic cancel feedback", () => {
    const panel = readFileSync(
      new URL("../components/lunch/staff-late-order-request-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(panel, /StatusBadge/);
    assert.match(
      panel,
      /You can only place one late lunch order per lunch provider today\./,
    );
    assert.match(panel, /optimisticCancelledIds/);
    assert.match(panel, /FormActionStatus variant="success"/);
  });

  it("drawer deep-link focuses trigger and only auto-opens when ordering is closed", () => {
    const drawer = readFileSync(
      new URL("../components/lunch/staff-late-order-drawer.tsx", import.meta.url),
      "utf8",
    );

    assert.match(drawer, /highlightFromQuery/);
    assert.match(drawer, /triggerRef\.current\?\.focus/);
    assert.match(drawer, /highlightFromQuery &&[\s\S]*!orderingOpen/);
    assert.match(drawer, /setDrawerOpen\(true\)/);
  });
});
