import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReportAndResolveNoChargePatch,
  canToggleDeliveryCheckbox,
  canUnmarkDelivered,
  countsForReconciliationFilter,
  formatFinalizationBlockedMessage,
  getNewIssueReportPrimaryActionLabel,
  getOperationalDisplayState,
  getStaffDeliveryStatusLabel,
  isImmediateNoChargeResolution,
  isPreparationQualifyingOrder,
  matchesReconciliationFilter,
} from "./delivery-reconciliation";

describe("delivery reconciliation helpers", () => {
  it("derives operational display states", () => {
    assert.equal(
      getOperationalDisplayState({
        status: "submitted",
        deliveryState: "pending",
        financialDisposition: "chargeable",
      }),
      "Pending",
    );
    assert.equal(
      getOperationalDisplayState({
        status: "fulfilled",
        deliveryState: "issue_open",
        financialDisposition: "on_hold",
      }),
      "Delivery issue",
    );
    assert.equal(
      getOperationalDisplayState({
        status: "cancelled",
        deliveryState: "resolved",
        financialDisposition: "waived",
      }),
      "Cancelled",
    );
  });

  it("shows staff-friendly on-hold and waived labels", () => {
    assert.equal(
      getStaffDeliveryStatusLabel({
        status: "submitted",
        deliveryState: "issue_open",
        financialDisposition: "on_hold",
      }),
      "Delivery issue — charge on hold",
    );
    assert.equal(
      getStaffDeliveryStatusLabel({
        status: "fulfilled",
        deliveryState: "resolved",
        financialDisposition: "waived",
      }),
      "Resolved — no charge",
    );
  });

  it("filters reconciliation views without mixing cancelled orders", () => {
    const order = {
      status: "submitted",
      deliveryState: "pending" as const,
    };
    assert.equal(matchesReconciliationFilter("pending", order), true);
    assert.equal(matchesReconciliationFilter("cancelled", order), false);
  });

  it("excludes waived orders from preparation totals", () => {
    assert.equal(
      isPreparationQualifyingOrder({
        status: "fulfilled",
        financialDisposition: "waived",
      }),
      false,
    );
    assert.equal(
      isPreparationQualifyingOrder({
        status: "submitted",
        financialDisposition: "on_hold",
      }),
      true,
    );
  });

  it("formats finalization blocker message for Accounts", () => {
    assert.equal(
      formatFinalizationBlockedMessage(3),
      "This lunch period cannot be finalized because 3 orders still require delivery reconciliation.",
    );
  });

  it("allows toggling only pending and delivered delivery states", () => {
    assert.equal(
      canToggleDeliveryCheckbox({ status: "submitted", deliveryState: "pending" }),
      true,
    );
    assert.equal(
      canUnmarkDelivered({ status: "fulfilled", deliveryState: "delivered" }),
      true,
    );
    assert.equal(
      canToggleDeliveryCheckbox({ status: "submitted", deliveryState: "issue_open" }),
      false,
    );
  });

  it("counts reconciliation filters across order states", () => {
    const counts = countsForReconciliationFilter([
      { status: "submitted", deliveryState: "pending" },
      { status: "fulfilled", deliveryState: "delivered" },
      { status: "submitted", deliveryState: "issue_open" },
      { status: "cancelled", deliveryState: "pending" },
    ]);

    assert.equal(counts.all, 4);
    assert.equal(counts.pending, 1);
    assert.equal(counts.delivered, 1);
    assert.equal(counts.issues, 1);
    assert.equal(counts.cancelled, 1);
  });
});

describe("immediate no-charge issue reporting", () => {
  it("detects only the no replacement / no charge resolution as immediate", () => {
    assert.equal(isImmediateNoChargeResolution("no_replacement_no_charge"), true);
    assert.equal(isImmediateNoChargeResolution("deliver_next_business_day"), false);
    assert.equal(isImmediateNoChargeResolution(""), false);
  });

  it("labels the new-issue primary action from the resolution plan", () => {
    assert.equal(
      getNewIssueReportPrimaryActionLabel("no_replacement_no_charge"),
      "Report & resolve",
    );
    assert.equal(
      getNewIssueReportPrimaryActionLabel("deliver_next_business_day"),
      "Report issue",
    );
    assert.equal(getNewIssueReportPrimaryActionLabel(""), "Report issue");
  });

  it("builds the same resolved waived patch shape as Resolve no charge", () => {
    const patch = buildReportAndResolveNoChargePatch({
      orderId: "order-1",
      issueType: "provider_cancelled",
      hrNotes: "Provider cancelled",
    });

    assert.deepEqual(patch, {
      id: "order-1",
      deliveryState: "resolved",
      financialDisposition: "waived",
      deliveryIssueType: "provider_cancelled",
      deliveryResolutionType: "no_replacement_no_charge",
      hrDeliveryNotes: "Provider cancelled",
    });

    const pending = [{ status: "submitted", deliveryState: "pending" as const }];
    const resolved = countsForReconciliationFilter([
      { status: "submitted", deliveryState: "pending" },
      {
        status: "submitted",
        deliveryState: patch.deliveryState,
      },
    ]);

    assert.equal(resolved.resolved, 1);
    assert.equal(resolved.pending, 1);
    assert.equal(
      countsForReconciliationFilter([
        { status: "submitted", deliveryState: patch.deliveryState },
      ]).resolved,
      1,
    );
    assert.equal(pending.length, 1);
  });
});
