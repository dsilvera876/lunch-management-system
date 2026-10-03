import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPrimaryProviderEmailPayload,
  buildPrimaryProviderEmailSubject,
  buildPrimaryProviderEmailText,
  escapeProviderEmailHtml,
  parsePrimaryProviderEmailSnapshot,
  serializePrimaryProviderEmailSnapshot,
} from "@/lib/provider-primary-order-email";
import type { OperationalOrder } from "@/lib/operational-orders";
import {
  canHrResendPrimaryProviderEmail,
  canHrSendPrimaryProviderEmail,
  type ProviderPrimaryDispatchStatusRow,
} from "@/lib/provider-primary-order-presentation";

function sampleOrder(overrides: Partial<OperationalOrder> = {}): OperationalOrder {
  return {
    id: "o1",
    profileId: "p1",
    status: "submitted",
    deliveryState: "pending",
    financialDisposition: "chargeable",
    deliveryIssueType: null,
    deliveryResolutionType: null,
    hrDeliveryNotes: null,
    actualDeliveryDate: null,
    lunchDayId: "ld1",
    createdAt: "2026-01-01T12:00:00Z",
    specialInstructions: null,
    mealQuantity: 1,
    employeeName: "Alex Example",
    officeLocationName: "Kingston",
    officeLocationAddress: null,
    orderDate: "2026-01-01",
    deliveryDate: "2026-01-02",
    providerId: "prov1",
    providerName: "Test Kitchen",
    items: [{ name: "Rice", quantity: 1, itemType: "main", unitLabel: "Each", displayCategory: null }],
    isLateOrder: false,
    lateOrderCreatedByName: null,
    lateOrderDispatched: false,
    ...overrides,
  };
}

function baseStatus(
  overrides: Partial<ProviderPrimaryDispatchStatusRow> = {},
): ProviderPrimaryDispatchStatusRow {
  return {
    providerId: "p1",
    scheduledDeliveryDate: "2026-01-02",
    latestStatus: "none",
    latestDispatchId: null,
    resendSourceDispatchId: null,
    sentAt: null,
    errorSummary: null,
    automaticOutcome: null,
    primaryOrderEmail: "kitchen@example.test",
    qualifyingOrderCount: 3,
    globallyEnabled: true,
    cutoffPassed: true,
    hasSuccessfulPrimarySend: false,
    ...overrides,
  };
}

describe("provider primary order email", () => {
  it("escapes HTML in user content", () => {
    assert.equal(escapeProviderEmailHtml(`Tom & "Jerry" <script>`), "Tom &amp; &quot;Jerry&quot; &lt;script&gt;");
  });

  it("builds distinct primary subject line", () => {
    const subject = buildPrimaryProviderEmailSubject({
      providerName: "Test Kitchen",
      deliveryDate: "2026-01-02",
    });
    assert.match(subject, /^Lunch order — Test Kitchen — 2026-01-02$/);
    assert.doesNotMatch(subject, /SUPPLEMENTAL/i);
  });

  it("includes employee name in text body", () => {
    const payload = buildPrimaryProviderEmailPayload([sampleOrder()], {
      providerId: "prov1",
      providerName: "Test Kitchen",
      deliveryDate: "2026-01-02",
    });
    assert.ok(payload);
    const text = buildPrimaryProviderEmailText(payload!);
    assert.match(text, /Alex Example/);
    assert.match(text, /KINGSTON/);
  });

  it("hides initial send when a successful primary send already exists", () => {
    const status = baseStatus({
      latestStatus: "failed",
      hasSuccessfulPrimarySend: true,
    });
    assert.equal(canHrSendPrimaryProviderEmail(status), false);
    assert.equal(canHrResendPrimaryProviderEmail(status), true);
  });

  it("resend email content uses persisted snapshot instead of changed order rows", () => {
    const originalPayload = buildPrimaryProviderEmailPayload([sampleOrder()], {
      providerId: "prov1",
      providerName: "Test Kitchen",
      deliveryDate: "2026-01-02",
    });
    assert.ok(originalPayload);

    const snapshot = serializePrimaryProviderEmailSnapshot(originalPayload);
    const changedPayload = buildPrimaryProviderEmailPayload(
      [sampleOrder({ employeeName: "Changed Name", items: [{ name: "Plantain", quantity: 2, itemType: "main", unitLabel: "Each", displayCategory: null }] })],
      {
        providerId: "prov1",
        providerName: "Test Kitchen",
        deliveryDate: "2026-01-02",
      },
    );
    assert.ok(changedPayload);

    const resendPayload = parsePrimaryProviderEmailSnapshot(snapshot);
    assert.ok(resendPayload);

    const resendText = buildPrimaryProviderEmailText(resendPayload);
    const changedText = buildPrimaryProviderEmailText(changedPayload);

    assert.match(resendText, /Alex Example/);
    assert.doesNotMatch(resendText, /Changed Name/);
    assert.match(changedText, /Changed Name/);
  });
});
