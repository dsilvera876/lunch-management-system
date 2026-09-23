import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatFormActionError } from "../components/ui/form-action-status";

describe("FormActionStatus", () => {
  it("formats action errors with a useful reason", () => {
    assert.equal(
      formatFormActionError("Unable to create late order", "Select at least one menu item"),
      "Unable to create late order. Select at least one menu item",
    );
  });

  it("exposes accessibility semantics for errors and success", () => {
    const source = readFileSync(
      new URL("../components/ui/form-action-status.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /variant === "error" \? "alert" : "status"/);
    assert.match(source, /aria-live/);
    assert.match(source, /assertive/);
    assert.match(source, /polite/);
  });

  it("is used for late-order workspace feedback", () => {
    const workspace = readFileSync(
      new URL("../components/admin/late-orders-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /FormActionStatus/);
    assert.match(workspace, /showToast/);
    assert.match(workspace, /LATE_ORDER_CREATE_SUCCESS_TOAST_TITLE/);
    assert.match(workspace, /formatLateOrderCreateErrorMessage/);
    assert.match(workspace, /formatFormActionError\("Unable to send supplemental email"/);
    assert.doesNotMatch(
      workspace,
      /setFeedback\(\{[\s\S]*Late order created successfully/,
    );
  });

  it("renders single-cycle delivery as read-only styled field", () => {
    const workspace = readFileSync(
      new URL("../components/admin/late-orders-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /ReadOnlyFormValue/);
    assert.match(workspace, /readOnlyFieldClassName|read-only-form-value/);
    assert.doesNotMatch(workspace, /type="date"/);
  });

  it("migrates representative client forms to shared feedback", () => {
    const deliveries = readFileSync(
      new URL("../components/admin/deliveries-workspace.tsx", import.meta.url),
      "utf8",
    );
    const subsidy = readFileSync(
      new URL("../components/daily-lunch-subsidy-control.tsx", import.meta.url),
      "utf8",
    );
    const cutoff = readFileSync(
      new URL("../components/cutoff-control.tsx", import.meta.url),
      "utf8",
    );
    const lunchPage = readFileSync(
      new URL("../app/lunch/page.tsx", import.meta.url),
      "utf8",
    );
    const lunchShell = readFileSync(
      new URL("../components/lunch/lunch-ordering-shell.tsx", import.meta.url),
      "utf8",
    );

    assert.match(deliveries, /FormActionStatus/);
    assert.match(subsidy, /FormActionStatus/);
    assert.match(cutoff, /FormActionStatus/);
    assert.match(lunchPage, /Alert variant="error"/);
    assert.match(lunchShell, /Lunch order placed successfully/);
  });
});
