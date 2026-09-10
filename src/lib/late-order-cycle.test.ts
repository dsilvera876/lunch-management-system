import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateLateOrderDeliveryDates,
  classifyLateOrderSnapshotWarning,
  resolveActionableLateOrderDeliveryDates,
  resolvePrimaryLateOrderDeliveryDate,
  shouldShowLateOrderProviderSummary,
} from "./late-order-cycle";
import {
  addCalendarDays,
  getDeliveryDateForOrderDate,
  getOrderDateForDeliveryDate,
} from "./datetime";

describe("order date ↔ delivery mapping", () => {
  it("maps Thursday delivery to Wednesday order date (not legacy stale offsets)", () => {
    assert.equal(getOrderDateForDeliveryDate("2026-09-10"), "2026-09-09");
    assert.equal(getDeliveryDateForOrderDate("2026-09-09"), "2026-09-10");
    assert.notEqual(getOrderDateForDeliveryDate("2026-09-10"), "2026-09-08");
  });

  it("adds calendar days in Jamaica", () => {
    assert.equal(addCalendarDays("2026-09-09", 1), "2026-09-10");
  });
});

describe("actionable late-order cycles", () => {
  it("includes next delivery after company cutoff when that cycle is open", () => {
    const dates = resolveActionableLateOrderDeliveryDates({
      today: "2099-01-05",
      companyCutoffPassedForToday: true,
      cycles: [
        {
          deliveryDate: "2099-01-06",
          orderDate: "2099-01-05",
          lateOrderingOpen: true,
        },
      ],
    });

    assert.deepEqual(dates, ["2099-01-06"]);
  });

  it("includes today's delivery on delivery morning while provider deadline is open", () => {
    const dates = resolveActionableLateOrderDeliveryDates({
      today: "2099-01-06",
      companyCutoffPassedForToday: false,
      cycles: [
        {
          deliveryDate: "2099-01-06",
          orderDate: "2099-01-05",
          lateOrderingOpen: true,
        },
      ],
    });

    assert.deepEqual(dates, ["2099-01-06"]);
  });

  it("defaults primary delivery to next business day after cutoff", () => {
    const primary = resolvePrimaryLateOrderDeliveryDate(["2099-01-06"], "2099-01-05");
    assert.equal(primary, "2099-01-06");
  });

  it("limits candidate delivery dates to today and next business delivery", () => {
    assert.deepEqual(candidateLateOrderDeliveryDates("2099-01-05"), [
      "2099-01-05",
      "2099-01-06",
    ]);
  });
});

describe("late-order page visibility", () => {
  it("hides closed cycles with no pending supplemental work", () => {
    assert.equal(
      shouldShowLateOrderProviderSummary({
        lateOrderingOpen: false,
        approvedUnsentCount: 0,
        hasBlockingDispatch: false,
        attentionDispatchId: null,
        lateOrderCount: 0,
      }),
      false,
    );
  });

  it("keeps cycles with unsent approved late orders visible", () => {
    assert.equal(
      shouldShowLateOrderProviderSummary({
        lateOrderingOpen: false,
        approvedUnsentCount: 2,
        hasBlockingDispatch: false,
        attentionDispatchId: null,
        lateOrderCount: 2,
      }),
      true,
    );
  });
});

describe("snapshot warnings", () => {
  it("labels historical missing snapshots without implying current-cycle materialization", () => {
    const warning = classifyLateOrderSnapshotWarning({
      snapshotMissing: true,
      orderDate: "2026-09-08",
      jamaicaToday: "2026-09-10",
      deliveryDate: "2026-09-10",
    });

    assert.equal(warning.kind, "historical_missing");
    assert.match(warning.message ?? "", /was not captured/);
    assert.doesNotMatch(warning.message ?? "", /Current-cycle/i);
  });
});
