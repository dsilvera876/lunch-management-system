import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  resolveLateOrderEligibilityOfficeLocationId,
  resolveLateOrderSaveAsDefaultCheckboxState,
  resolveLateOrderSaveAsDefaultOnLocationChange,
  shouldSaveDefaultOnLateOrderSubmit,
} from "./staff-late-order-location-save";

const locA = "loc-a";
const locB = "loc-b";

describe("late-order save-as-default checkbox matrix", () => {
  it("A: no location selected -> visible, unchecked, disabled", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(locA, ""), {
      checked: false,
      disabled: true,
    });
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(null, ""), {
      checked: false,
      disabled: true,
    });
  });

  it("B: no saved default + location selected -> enabled, checked by default", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(null, locA), {
      checked: true,
      disabled: false,
    });
    assert.equal(resolveLateOrderSaveAsDefaultOnLocationChange(null, locA), true);
  });

  it("C: selected location equals saved default -> checked, disabled, no save RPC", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(locA, locA), {
      checked: true,
      disabled: true,
    });
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(true, locA, locA), false);
  });

  it("D: saved default A + selected B -> enabled, unchecked by default", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(locA, locB), {
      checked: false,
      disabled: false,
    });
    assert.equal(resolveLateOrderSaveAsDefaultOnLocationChange(locA, locB), false);
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(false, locA, locB), false);
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(true, locA, locB), true);
  });
});

describe("late-order delivery location default save UX", () => {
  it("does not persist default on location selection", () => {
    const drawer = readFileSync(
      new URL("../components/lunch/staff-late-order-drawer.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      drawer,
      /handleSelectOfficeLocation[\s\S]*saveMyDefaultOfficeLocation/,
    );
    assert.doesNotMatch(drawer, /refreshCyclesForLocation[\s\S]*saveMyDefaultOfficeLocation/);
    assert.doesNotMatch(drawer, /router\.refresh\(\)/);
    assert.doesNotMatch(drawer, /Choose a delivery location to see eligible providers/);
    assert.match(drawer, /Save as my default delivery location/);
    assert.match(drawer, /disabled=\{saveAsDefaultControl\.disabled\}/);
    assert.doesNotMatch(drawer, /shouldShowLateOrderSaveAsDefaultCheckbox/);
  });

  it("persists default only on successful submit when opted in", () => {
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(true, null, locA), true);
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(false, null, locA), false);

    const actions = readFileSync(
      new URL("../app/home/staff-late-order-request-actions.ts", import.meta.url),
      "utf8",
    );
    const createAction = actions.slice(
      actions.indexOf("export async function createStaffLateOrderRequestAction"),
    );
    const createIdx = createAction.indexOf("create_staff_late_order_request");
    const saveIdx = createAction.indexOf("saveMyDefaultOfficeLocation");
    assert.ok(createIdx >= 0 && saveIdx > createIdx, "request is created before optional default save");
  });
});

describe("inactive saved default office location", () => {
  it("treats inactive saved default as no usable default for eligibility RPC", () => {
    assert.equal(resolveLateOrderEligibilityOfficeLocationId("loc-a", true), null);
    assert.equal(resolveLateOrderEligibilityOfficeLocationId("loc-a", false), "loc-a");
    assert.equal(resolveLateOrderEligibilityOfficeLocationId(null, false), null);
  });

  it("loads requests independently from eligibility in staff-late-order-request-actions", () => {
    const actions = readFileSync(
      new URL("../app/home/staff-late-order-request-actions.ts", import.meta.url),
      "utf8",
    );
    const loader = actions.slice(actions.indexOf("export async function loadStaffLateOrderRequestContext"));
    assert.match(loader, /get_my_staff_late_order_requests/);
    assert.doesNotMatch(loader, /Promise\.all\([\s\S]*get_my_staff_late_order_requests/);
    assert.match(actions, /staff_late_order_new_request_summary/);

    const home = readFileSync(new URL("../app/home/page.tsx", import.meta.url), "utf8");
    const lunch = readFileSync(new URL("../app/lunch/page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(home, /loadStaffLateOrderRequestContext[\s\S]*\.catch\(\(\) => \(\{\s*eligibleCycles: \[\],\s*requests: \[\]/);
    assert.doesNotMatch(lunch, /loadStaffLateOrderRequestContext[\s\S]*\.catch\(\(\) => \(\{\s*eligibleCycles: \[\],\s*requests: \[\]/);
    assert.doesNotMatch(home, /allowLateOrderLocationSelection/);
    assert.doesNotMatch(lunch, /allowLateOrderLocationSelection/);
    assert.match(home, /loadStaffLateOrderNewRequestSummary/);
    assert.match(lunch, /loadStaffLateOrderNewRequestSummary/);
  });
});

describe("late-order submit partial failure handling", () => {
  it("reports default save warning without blocking successful request outcome", () => {
    const actions = readFileSync(
      new URL("../app/home/staff-late-order-request-actions.ts", import.meta.url),
      "utf8",
    );
    const createAction = actions.slice(
      actions.indexOf("export async function createStaffLateOrderRequestAction"),
    );
    assert.match(createAction, /defaultSaveWarning = LATE_ORDER_DEFAULT_SAVE_WARNING/);
    assert.match(createAction, /return \{ ok: true, requestId: String\(data\), defaultSaveWarning \}/);

    const card = readFileSync(
      new URL("../components/my-orders/late-order-submission-card.tsx", import.meta.url),
      "utf8",
    );
    assert.match(card, /LateOrderSubmissionEditModal/);
  });
});

describe("staff3-style availability (no default, offices exist, all providers late off)", () => {
  it("home and lunch gate Submit CTA on authoritative new-request availability", () => {
    const home = readFileSync(new URL("../app/home/page.tsx", import.meta.url), "utf8");
    const lunch = readFileSync(new URL("../app/lunch/page.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(
      new URL("../components/dashboard/staff-dashboard.tsx", import.meta.url),
      "utf8",
    );

    assert.match(home, /lateOrderRequestAvailable = !ctx\.orderingOpen && hasNewLateOrderOpportunity/);
    assert.match(lunch, /newLateOrderOpportunity/);
    assert.match(lunch, /buildStaffLateOrderDrawerContext/);
    assert.doesNotMatch(home, /officeLocationsResult\.data\?\.length.*lateOrder/);
    assert.match(dashboard, /lateOrderStatusAvailable/);
    assert.match(dashboard, /Late order status/);
  });
});
