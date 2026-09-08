import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFinalizationBlockedMessage,
  getOperationalDisplayState,
  getStaffDeliveryStatusLabel,
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
});
