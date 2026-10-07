import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LATE_ORDER_SUBMIT_SUCCESS_MESSAGE,
  buildLateOrderSubmitFeedback,
} from "./staff-late-order-submission-feedback";

describe("late-order submission feedback", () => {
  it("uses durable success copy and keeps warning separate from failure", () => {
    assert.equal(LATE_ORDER_SUBMIT_SUCCESS_MESSAGE, "Late order submitted for review.");
    const withWarning = buildLateOrderSubmitFeedback("Could not save default location.");
    assert.equal(withWarning.successMessage, LATE_ORDER_SUBMIT_SUCCESS_MESSAGE);
    assert.equal(withWarning.warningMessage, "Could not save default location.");
    const withoutWarning = buildLateOrderSubmitFeedback();
    assert.equal(withoutWarning.warningMessage, null);
  });

  it("stores drawer feedback in root state so refresh does not unmount it", () => {
    const drawer = readFileSync("src/components/lunch/staff-late-order-drawer.tsx", "utf8");
    const lunch = readFileSync("src/app/lunch/page.tsx", "utf8");
    const panel = readFileSync("src/components/lunch/staff-late-order-request-panel.tsx", "utf8");

    assert.match(drawer, /submissionFeedback/);
    assert.match(drawer, /handleDrawerOpenChange/);
    assert.match(drawer, /clearSubmissionFeedback\(\)/);
    assert.match(drawer, /Late order submitted for review\.|submissionFeedback\.successMessage/);
    assert.doesNotMatch(lunch, /StaffLateOrderDrawerRoot[\s\S]*key=\{defaultOfficeLocationId/);
    assert.doesNotMatch(drawer, /key=\{\`\$\{selectedDeliveryDate\}:\$\{selectedOfficeLocationId\}\`\}/);
    assert.match(panel, /buildLateOrderSubmitFeedback/);
    assert.match(panel, /layoutVariant !== "drawer" && successMessage/);
  });

  it("clears drawer confirmation on close and new submission attempts", () => {
    const drawer = readFileSync("src/components/lunch/staff-late-order-drawer.tsx", "utf8");
    const panel = readFileSync("src/components/lunch/staff-late-order-request-panel.tsx", "utf8");

    assert.match(drawer, /if \(!open\) \{\s*clearSubmissionFeedback\(\)/);
    assert.match(panel, /lateOrderDrawer\?\.clearSubmissionFeedback\(\)/);
    assert.match(panel, /if \(!result\.ok\)/);
    assert.match(panel, /setSubmissionFeedback\([\s\S]*buildLateOrderSubmitFeedback/);
  });
});
