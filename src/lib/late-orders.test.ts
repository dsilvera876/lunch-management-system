import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSupplementalEmailPayloadSafe,
  buildSupplementalEmailBody,
  buildSupplementalEmailSubject,
  canSendOutstandingSupplement,
  formatSupplementDispatchStatusLabel,
  isAutomaticSupplementDue,
  isProviderLateOrderingOpen,
  isValidProviderOrderEmail,
  providerLateOrderAnchorAt,
  validateAutomaticSupplementSchedule,
} from "./late-orders";

describe("late order deadline helpers", () => {
  it("calculates delivery-day and order-day anchors in Jamaica time", () => {
    const deliveryDeadline = providerLateOrderAnchorAt(
      "delivery_day",
      "10:30:00",
      "2099-01-05",
      "2099-01-06",
    );
    const orderDeadline = providerLateOrderAnchorAt(
      "order_day",
      "18:00:00",
      "2099-01-05",
      "2099-01-06",
    );

    assert.equal(
      deliveryDeadline.toISOString(),
      new Date("2099-01-06T10:30:00-05:00").toISOString(),
    );
    assert.equal(
      orderDeadline.toISOString(),
      new Date("2099-01-05T18:00:00-05:00").toISOString(),
    );
  });

  it("rejects automatic send after provider deadline", () => {
    const error = validateAutomaticSupplementSchedule(
      {
        acceptsLateOrders: true,
        lateOrderDeadlineDay: "delivery_day",
        lateOrderDeadlineTime: "10:30:00",
        supplementalDispatchMode: "automatic",
        automaticSupplementSendDay: "delivery_day",
        automaticSupplementSendTime: "11:00:00",
        primaryOrderEmail: "kitchen@example.com",
      },
      "2099-01-05",
      "2099-01-06",
    );

    assert.match(error ?? "", /on or before/);
  });

  it("opens late ordering only after company cutoff and before provider deadline", () => {
    const settings = {
      acceptsLateOrders: true,
      lateOrderDeadlineDay: "delivery_day" as const,
      lateOrderDeadlineTime: "10:30:00",
    };

    assert.equal(
      isProviderLateOrderingOpen(
        settings,
        "2099-01-05",
        "2099-01-06",
        new Date("2099-01-06T10:00:00-05:00"),
        true,
      ),
      true,
    );
    assert.equal(
      isProviderLateOrderingOpen(
        settings,
        "2099-01-05",
        "2099-01-06",
        new Date("2099-01-06T11:00:00-05:00"),
        true,
      ),
      false,
    );
    assert.equal(
      isProviderLateOrderingOpen(
        settings,
        "2099-01-05",
        "2099-01-06",
        new Date("2099-01-05T17:00:00-05:00"),
        false,
      ),
      false,
    );
  });
});

describe("supplemental email helpers", () => {
  it("builds privacy-safe supplemental email content", () => {
    const subject = buildSupplementalEmailSubject({
      providerName: "Alberries Caterors",
      deliveryDate: "2099-01-06",
    });
    const body = buildSupplementalEmailBody({
      providerName: "Alberries Caterors",
      deliveryDate: "2099-01-06",
      ordersByOffice: [
        {
          officeName: "Office 1",
          orders: [
            {
              employeeName: "Jane Smith",
              officeLocationName: "Office 1",
              orderLines: ["Fried Chicken + Rice & Peas"],
              quantityLines: ["2"],
              specialInstructions: "Lots of gravy",
            },
          ],
        },
      ],
    });

    assert.match(subject, /SUPPLEMENTAL LATE ORDERS/);
    assert.match(body, /in addition to previously submitted orders/);
    assert.match(body, /Jane Smith/);
    assert.doesNotMatch(body.toLowerCase(), /subsidy|payroll|email/);

    assert.doesNotThrow(() =>
      assertSupplementalEmailPayloadSafe({
        providerName: "Alberries Caterors",
        ordersByOffice: [{ officeName: "Office 1", orders: [] }],
      }),
    );
  });

  it("validates provider order email format", () => {
    assert.equal(isValidProviderOrderEmail("kitchen@example.com"), true);
    assert.equal(isValidProviderOrderEmail("not-an-email"), false);
  });
});

describe("automatic supplement dispatch helpers", () => {
  const automaticSettings = {
    supplementalDispatchMode: "automatic" as const,
    automaticSupplementSendDay: "delivery_day" as const,
    automaticSupplementSendTime: "10:00:00",
    lateOrderDeadlineDay: "delivery_day" as const,
    lateOrderDeadlineTime: "10:30:00",
  };

  it("detects due automatic supplements between send time and deadline", () => {
    assert.equal(
      isAutomaticSupplementDue(
        automaticSettings,
        "2099-01-05",
        "2099-01-06",
        new Date("2099-01-06T10:01:00-05:00"),
      ),
      true,
    );
    assert.equal(
      isAutomaticSupplementDue(
        automaticSettings,
        "2099-01-05",
        "2099-01-06",
        new Date("2099-01-06T09:59:00-05:00"),
      ),
      false,
    );
  });

  it("formats supplement status labels for automation states", () => {
    assert.match(
      formatSupplementDispatchStatusLabel({
        dispatchMode: "automatic",
        approvedUnsentCount: 2,
        lateOrderingOpen: true,
        automaticDue: true,
        snapshotMissing: false,
        latestDispatch: null,
        automaticOpportunity: null,
        now: new Date("2099-01-06T10:01:00-05:00"),
      }),
      /Scheduled/,
    );
    assert.match(
      formatSupplementDispatchStatusLabel({
        dispatchMode: "automatic",
        approvedUnsentCount: 2,
        lateOrderingOpen: false,
        automaticDue: false,
        snapshotMissing: false,
        latestDispatch: null,
        automaticOpportunity: null,
        now: new Date("2099-01-06T11:00:00-05:00"),
      }),
      /Automatic window missed/,
    );
    assert.match(
      formatSupplementDispatchStatusLabel({
        dispatchMode: "automatic",
        approvedUnsentCount: 1,
        lateOrderingOpen: true,
        automaticDue: false,
        snapshotMissing: false,
        latestDispatch: null,
        automaticOpportunity: {
          outcome: "no_orders",
          processedAt: "2099-01-06T10:01:00-05:00",
          lateOrderCount: 0,
        },
        now: new Date("2099-01-06T10:05:00-05:00"),
      }),
      /Automatic send processed — no orders/,
    );
  });

  it("allows manual send only when eligible and not blocked", () => {
    assert.equal(
      canSendOutstandingSupplement({
        approvedUnsentCount: 1,
        primaryOrderEmail: "kitchen@example.com",
        lateOrderingOpen: true,
        hasBlockingDispatch: false,
      }),
      true,
    );
    assert.equal(
      canSendOutstandingSupplement({
        approvedUnsentCount: 1,
        primaryOrderEmail: "kitchen@example.com",
        lateOrderingOpen: true,
        hasBlockingDispatch: true,
      }),
      false,
    );
  });
});
