import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LATE_ORDER_AVAILABILITY_CHECKING_MESSAGE,
  LATE_ORDER_SUBMITTING_MESSAGE,
  formatLateOrderAvailabilityAnnouncement,
} from "./staff-late-order-drawer-accessibility";

function readComponent(path: string): string {
  return readFileSync(new URL(`../components/${path}`, import.meta.url), "utf8");
}

describe("formatLateOrderAvailabilityAnnouncement", () => {
  it("describes zero, one and many options", () => {
    assert.equal(
      formatLateOrderAvailabilityAnnouncement(0),
      "No late-order providers are available for this location.",
    );
    assert.equal(formatLateOrderAvailabilityAnnouncement(1), "1 late-order option is available.");
    assert.equal(formatLateOrderAvailabilityAnnouncement(3), "3 late-order options are available.");
  });

  it("exposes non-empty progress messages", () => {
    assert.match(LATE_ORDER_AVAILABILITY_CHECKING_MESSAGE, /Checking late-order availability/);
    assert.match(LATE_ORDER_SUBMITTING_MESSAGE, /Submitting late order request/);
  });
});

describe("late-order drawer focus management", () => {
  const drawer = readComponent("lunch/staff-late-order-drawer.tsx");
  const panel = readComponent("lunch/staff-late-order-request-panel.tsx");

  it("opens on the heading instead of jumping into the delivery-date select", () => {
    assert.match(drawer, /initialFocusRef=\{headingRef\}/);
    assert.doesNotMatch(panel, /cycleSelectRef/);
    assert.doesNotMatch(panel, /useEffect\(/);
  });

  it("restores focus to the trigger, the header action, or main content on close", () => {
    assert.match(drawer, /restoreFocusAfterLateOrderDrawerClose\(triggerRef\.current\)/);
    assert.match(drawer, /\[data-late-order-header-action\]/);
    assert.match(drawer, /getElementById\("main-content"\)/);
    assert.match(
      readComponent("lunch/staff-late-order-header-action.tsx"),
      /data-late-order-header-action/,
    );
  });

  it("keeps the backdrop out of the tab order and offers a Cancel button", () => {
    assert.match(drawer, /<div\s+aria-hidden="true"\s+data-late-order-drawer-backdrop/);
    assert.match(panel, /onClick=\{\(\) => lateOrderDrawer\.handleDrawerOpenChange\(false\)\}[\s\S]*Cancel/);
  });

  it("announces availability through one persistent status region", () => {
    assert.match(drawer, /role="status" aria-atomic="true" data-late-order-availability-status/);
    assert.match(drawer, /formatLateOrderAvailabilityAnnouncement\(/);
    assert.doesNotMatch(panel, /aria-live="polite"[^>]*>\s*\{?LATE_ORDER_AVAILABILITY|role="status"[^>]*>\s*Checking/);
  });

  it("associates the location error with the select", () => {
    assert.match(drawer, /aria-describedby=\{locationError \? locationErrorId : undefined\}/);
  });

  it("focuses submission feedback without also speaking it from a live region", () => {
    assert.match(drawer, /data-late-order-submission-feedback/);
    assert.match(drawer, /<FormActionStatus variant="success" liveRegion=\{false\}>/);
    assert.match(drawer, /feedbackRef\.current\?\.focus/);
  });

  it("blocks duplicate submissions and shows pending state", () => {
    assert.match(panel, /if \(submittingRef\.current\) \{\s*return;/);
    assert.match(panel, /aria-disabled=\{submitting \? true : undefined\}/);
    assert.match(panel, /aria-busy=\{submitting \? true : undefined\}/);
    assert.match(panel, /submitting \? "Submitting…" : "Submit late order"/);
  });

  it("validation errors are focused, not double-announced", () => {
    assert.match(panel, /ref=\{errorSummaryRef\}[\s\S]*?liveRegion=\{false\}/);
  });
});
