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
    assert.match(dashboard, /lateOrderActionWhileOrderingOpen/);
    assert.match(dashboard, /lateOrderActionLabel/);
    assert.match(dashboard, /Submit late order/);
    assert.match(dashboard, /lateOrderRequestAvailable \?/);
    assert.match(dashboard, /lateOrderStatusAvailable \?/);
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
    assert.match(lunch, /StaffLateOrderDrawerTrigger/);
    assert.doesNotMatch(lunch, /StaffLateOrderRequestSection/);
    assert.match(drawer, /FocusTrapPopover/);
    assert.match(drawer, /aria-label="Close late order drawer"/);
    assert.match(drawer, /staffLateOrderDrawerTitle/);
    assert.match(drawer, /Delivery location/);
    assert.match(drawer, /Delivery date/);
    assert.match(drawer, /Save as my default delivery location/);
    assert.match(drawer, /locationFetchGenerationRef/);
    assert.match(drawer, /beginLocationEligibilityFetch/);
    assert.match(drawer, /eligibilityLoading=\{cyclesLoading\}/);
    assert.match(panel, /Checking late-order availability/);
    assert.match(panel, /eligibilityLoading/);
    assert.doesNotMatch(
      drawer,
      /handleSelectOfficeLocation[\s\S]*saveMyDefaultOfficeLocation/,
    );
    assert.match(drawer, /filterStaffLateOrderForDeliveryDate/);
    assert.match(drawer, /deliveryDates\.length > 1/);
    assert.match(drawer, /key=\{\`\$\{selectedDeliveryDate\}:\$\{selectedOfficeLocationId\}\`\}/);
    assert.doesNotMatch(panel, /type="date"|delivery date selector/i);
    assert.match(panel, /const showEntry = eligibleCycles\.length > 0/);
    assert.match(panel, /locationRequired && requestRows\.length === 0/);
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

  it("home and lunch expose late-order context without staff-only role gating", () => {
    const home = readFileSync(new URL("../app/home/page.tsx", import.meta.url), "utf8");
    const lunch = readFileSync(new URL("../app/lunch/page.tsx", import.meta.url), "utf8");
    const actions = readFileSync(
      new URL("../app/home/staff-late-order-request-actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(home, /loadStaffLateOrderRequestContext\(/);
    assert.match(lunch, /loadStaffLateOrderRequestContext\(/);
    assert.doesNotMatch(actions, /role === ["']staff["']/);
    assert.doesNotMatch(home, /profile\.role === ["']staff["'][\\s\\S]*lateOrder/);
    assert.doesNotMatch(lunch, /profile\.role === ["']staff["']/);
    assert.doesNotMatch(
      home,
      /loadStaffLateOrderRequestContext[\s\S]*requests: \[\]/,
    );
  });

  it("drawer deep-link auto-opens when lateOrder=1 and late-order entry exists", () => {
    const drawer = readFileSync(
      new URL("../components/lunch/staff-late-order-drawer.tsx", import.meta.url),
      "utf8",
    );

    assert.match(drawer, /highlightFromQuery/);
    assert.match(drawer, /highlightFromQuery &&[\s\S]*staffLateOrderDrawerVisible/);
    assert.doesNotMatch(drawer, /highlightFromQuery &&[\s\S]*!orderingOpen/);
    assert.match(drawer, /setDrawerOpen\(true\)/);
  });
});
