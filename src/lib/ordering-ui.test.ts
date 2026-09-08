import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatWeekdayList } from "./datetime";
import {
  calculateLineSubtotal,
  formatDisplayDate,
  formatOrderDeliveryHeadline,
  getOrderingClosedReason,
  isValidOrderQuantity,
  parseOrderQuantity,
  summarizeProviderWeekdays,
} from "./ordering-ui";

describe("formatWeekdayList", () => {
  it("joins weekday shorts with spaces", () => {
    assert.equal(formatWeekdayList([1, 3, 5]), "Mon Wed Fri");
    assert.equal(formatWeekdayList([1, 2, 3, 4, 5]), "Mon Tue Wed Thu Fri");
  });
});

describe("formatDisplayDate", () => {
  it("formats a calendar date with weekday and month name", () => {
    assert.match(formatDisplayDate("2026-09-08"), /Tuesday, September 8/);
  });
});

describe("formatOrderDeliveryHeadline", () => {
  it("describes ordering today for a delivery date", () => {
    assert.equal(
      formatOrderDeliveryHeadline("2026-09-08"),
      "Order today for delivery Tuesday, September 8",
    );
  });
});

describe("getOrderingClosedReason", () => {
  it("returns weekend reason when there is no order weekday", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: null,
      periodFinalized: false,
      orderingOpen: false,
    });

    assert.equal(reason?.title, "Ordering closed for the weekend");
  });

  it("returns finalized reason before cutoff reason", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: 1,
      periodFinalized: true,
      orderingOpen: false,
    });

    assert.match(reason?.description ?? "", /finalized/);
  });

  it("returns null when ordering is open", () => {
    assert.equal(
      getOrderingClosedReason({
        orderWeekday: 2,
        periodFinalized: false,
        orderingOpen: true,
      }),
      null,
    );
  });

  it("returns cutoff reason when the window is closed", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: 3,
      periodFinalized: false,
      orderingOpen: false,
    });

    assert.match(reason?.description ?? "", /window has closed/);
  });
});

describe("quantity helpers", () => {
  it("parses and clamps invalid quantities to zero or above", () => {
    assert.equal(parseOrderQuantity("2.9"), 2);
    assert.equal(parseOrderQuantity("-3"), 0);
    assert.equal(parseOrderQuantity("abc"), 0);
  });

  it("validates order quantities of at least one", () => {
    assert.equal(isValidOrderQuantity(1), true);
    assert.equal(isValidOrderQuantity(0), false);
    assert.equal(isValidOrderQuantity("2"), true);
  });

  it("calculates line subtotals", () => {
    assert.equal(calculateLineSubtotal("12.50", 2), 25);
  });
});

describe("summarizeProviderWeekdays", () => {
  it("summarizes active item weekdays without duplicates", () => {
    assert.equal(
      summarizeProviderWeekdays([
        { active: true, weekdays: [1, 3] },
        { active: true, weekdays: [3, 5] },
        { active: false, weekdays: [2] },
      ]),
      "Mon Wed Fri",
    );
  });

  it("reports when there are no active items", () => {
    assert.equal(
      summarizeProviderWeekdays([{ active: false, weekdays: [1] }]),
      "No active items",
    );
  });
});
