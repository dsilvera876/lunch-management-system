import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DELIVERY_TOGGLE_ERROR_MESSAGE,
  deliveryStatusBadgeClassName,
  deliveriesOfficeCardClassName,
  orderHistoryTimelineDotClassName,
  resolveDeliveryStatusBadgeVariant,
} from "./deliveries-presentation";
import {
  canToggleDeliveryCheckbox,
  canUnmarkDelivered,
  countsForReconciliationFilter,
} from "./delivery-reconciliation";
import {
  applyDeliveriesToolbarFilters,
  captureDeliveryToggleSnapshot,
  patchDeliveryOrder,
  patchFromDelivered,
  patchFromRevertedToPending,
} from "./deliveries";

function makeOrder(
  overrides: Partial<{
    id: string;
    status: string;
    deliveryState: string;
    providerId: string;
    officeLocationName: string;
  }> = {},
) {
  return {
    id: "o1",
    profileId: "profile-1",
    status: "submitted",
    deliveryState: "pending",
    financialDisposition: "chargeable",
    deliveryIssueType: null,
    deliveryResolutionType: null,
    hrDeliveryNotes: null,
    actualDeliveryDate: null,
    lunchDayId: "ld1",
    createdAt: "2026-01-01T00:00:00Z",
    specialInstructions: null,
    mealQuantity: 1,
    employeeName: "Staff One",
    officeLocationName: "Camp Road",
    officeLocationAddress: null,
    orderDate: "2026-01-01",
    deliveryDate: "2026-01-02",
    providerId: "p1",
    providerName: "Provider",
    items: [],
    isLateOrder: false,
    lateOrderCreatedByName: null,
    lateOrderDispatched: false,
    ...overrides,
  } as import("./operational-orders").OperationalOrder;
}

describe("deliveries presentation", () => {
  it("maps status badge variants", () => {
    assert.equal(
      resolveDeliveryStatusBadgeVariant({
        status: "submitted",
        deliveryState: "pending",
        financialDisposition: "chargeable",
      }),
      "pending",
    );
    assert.match(deliveryStatusBadgeClassName("delivered"), /emerald/);
    assert.match(deliveryStatusBadgeClassName("issue"), /amber/);
    assert.match(orderHistoryTimelineDotClassName("pending"), /slate/);
    assert.match(orderHistoryTimelineDotClassName("delivered"), /emerald/);
    assert.match(orderHistoryTimelineDotClassName("issue"), /amber/);
    assert.match(orderHistoryTimelineDotClassName("resolved"), /teal/);
    assert.match(orderHistoryTimelineDotClassName("cancelled"), /slate/);
    assert.match(deliveriesOfficeCardClassName, /border-t-4/);
  });

  it("supports reversible delivery checkbox eligibility", () => {
    const pending = makeOrder({ deliveryState: "pending" });
    const delivered = makeOrder({ deliveryState: "delivered", status: "fulfilled" });

    assert.equal(canToggleDeliveryCheckbox(pending), true);
    assert.equal(canUnmarkDelivered(delivered), true);
    assert.equal(canToggleDeliveryCheckbox(delivered), true);
    assert.equal(
      canToggleDeliveryCheckbox(makeOrder({ deliveryState: "issue_open" })),
      false,
    );
  });

  it("optimistically patches pending and delivered states", () => {
    const pending = makeOrder({ id: "o1", deliveryState: "pending" });
    const delivered = patchDeliveryOrder(
      [pending],
      patchFromDelivered(pending, "2026-09-23"),
    )[0]!;

    assert.equal(delivered.deliveryState, "delivered");

    const reverted = patchDeliveryOrder(
      [delivered],
      patchFromRevertedToPending(delivered),
    )[0]!;

    assert.equal(reverted.deliveryState, "pending");
    assert.equal(reverted.status, "submitted");
  });

  it("rolls back from captured toggle snapshots", () => {
    const pending = makeOrder({ id: "o1", deliveryState: "pending" });
    const snapshot = captureDeliveryToggleSnapshot(pending);
    const optimistic = patchDeliveryOrder(
      [pending],
      patchFromDelivered(pending, "2026-09-23"),
    );

    const rolledBack = patchDeliveryOrder(optimistic, snapshot);
    assert.equal(rolledBack[0]?.deliveryState, "pending");
  });

  it("updates status filter counts from toolbar-filtered orders", () => {
    const orders = [
      makeOrder({ id: "o1", deliveryState: "pending", providerId: "p1" }),
      makeOrder({
        id: "o2",
        deliveryState: "delivered",
        status: "fulfilled",
        providerId: "p2",
      }),
    ];

    const toolbar = applyDeliveriesToolbarFilters(orders, {
      providerId: "p1",
      officeLocation: "",
    });
    const counts = countsForReconciliationFilter(toolbar);

    assert.equal(counts.pending, 1);
    assert.equal(counts.delivered, 0);
    assert.equal(counts.all, 1);
  });

  it("patches a pending order to resolved when reporting and resolving no charge", () => {
    const orders = [
      {
        id: "o1",
        status: "submitted",
        deliveryState: "pending" as const,
        financialDisposition: "chargeable" as const,
      },
      {
        id: "o2",
        status: "submitted",
        deliveryState: "pending" as const,
        financialDisposition: "chargeable" as const,
      },
    ];

    const next = patchDeliveryOrder(orders as never, {
      id: "o1",
      deliveryState: "resolved",
      financialDisposition: "waived",
      deliveryIssueType: "provider_cancelled",
      deliveryResolutionType: "no_replacement_no_charge",
      hrDeliveryNotes: "Closed",
    });

    const counts = countsForReconciliationFilter(next as never);
    assert.equal(counts.pending, 1);
    assert.equal(counts.resolved, 1);
    assert.equal(counts.issues, 0);
  });

  it("wires deliveries workspace without delivery success toasts", () => {
    const workspace = readFileSync(
      new URL("../components/admin/deliveries-workspace.tsx", import.meta.url),
      "utf8",
    );
    const issuePanel = readFileSync(
      new URL("../components/admin/delivery-issue-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /DeliveriesPageHeader/);
    assert.match(workspace, /deliveriesOfficeCardClassName/);
    assert.match(workspace, /countsForReconciliationFilter/);
    assert.match(workspace, /revertOrderDeliveryToPendingMutation/);
    assert.match(workspace, /DELIVERY_TOGGLE_ERROR_MESSAGE/);
    assert.match(workspace, /type="checkbox"/);
    assert.doesNotMatch(workspace, /Delivery update saved successfully/);
    assert.doesNotMatch(workspace, /Order marked delivered successfully/);
    assert.match(workspace, /View \/ Edit issue/);
    assert.match(issuePanel, /sticky bottom-0/);
    assert.match(issuePanel, /Save changes/);
    assert.match(issuePanel, /getNewIssueReportPrimaryActionLabel/);
    assert.match(issuePanel, /reportAndResolveOrderDeliveryNoChargeMutation/);
    assert.doesNotMatch(issuePanel, /Update resolution/);
    assert.doesNotMatch(issuePanel, /Save notes/);
    assert.equal(
      DELIVERY_TOGGLE_ERROR_MESSAGE,
      "Could not update delivery. Try again.",
    );
  });
});
