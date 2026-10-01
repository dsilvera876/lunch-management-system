import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatWeekdayList } from "./datetime";
import {
  calculateLineSubtotal,
  canEditOrder,
  formatDisplayDate,
  formatOrderDeliveryHeadline,
  formatStaffBusinessDayClosedMessage,
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

describe("formatStaffBusinessDayClosedMessage", () => {
  it("formats company closure with due wording", () => {
    assert.equal(
      formatStaffBusinessDayClosedMessage({
        entryType: "company_closure",
        name: "Hurricane",
      }),
      "Lunch ordering is closed today due to Hurricane.",
    );
  });

  it("formats public holiday with for wording", () => {
    assert.equal(
      formatStaffBusinessDayClosedMessage({
        entryType: "public_holiday",
        name: "Emancipation Day",
      }),
      "Lunch ordering is closed today for Emancipation Day.",
    );
  });

  it("formats override closed with due wording", () => {
    assert.equal(
      formatStaffBusinessDayClosedMessage({
        entryType: "override_closed",
        name: "Emergency shutdown",
      }),
      "Lunch ordering is closed today due to Emergency shutdown.",
    );
  });

  it("uses a clean fallback when there is no named entry", () => {
    assert.equal(formatStaffBusinessDayClosedMessage(null), "Lunch ordering is closed today.");
    assert.equal(
      formatStaffBusinessDayClosedMessage({ entryType: null, name: null }),
      "Lunch ordering is closed today.",
    );
  });

  it("does not expose internal calendar terminology", () => {
    const message = formatStaffBusinessDayClosedMessage({
      entryType: "company_closure",
      name: "Hurricane",
    });
    assert.doesNotMatch(message, /business calendar/i);
    assert.doesNotMatch(message, /override_closed/i);
    assert.doesNotMatch(message, /holiday or company closure/i);
  });
});

describe("getOrderingClosedReason", () => {
  it("returns a named weekday closure message", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: 3,
      businessDayOpen: false,
      businessDayClosure: { entryType: "company_closure", name: "Hurricane" },
      periodFinalized: false,
      orderingOpen: false,
    });

    assert.equal(reason?.title, "Ordering closed today");
    assert.equal(reason?.description, "Lunch ordering is closed today due to Hurricane.");
    assert.equal(reason?.emptyStateDescription, "Lunch ordering is unavailable today.");
  });

  it("returns a simple weekend fallback without naming the weekend", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: null,
      businessDayOpen: false,
      businessDayClosure: { entryType: null, name: null },
      periodFinalized: false,
      orderingOpen: false,
    });

    assert.equal(reason?.description, "Lunch ordering is closed today.");
    assert.doesNotMatch(reason?.description ?? "", /weekend/i);
  });

  it("returns finalized reason before cutoff reason", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: 1,
      businessDayOpen: true,
      businessDayClosure: null,
      periodFinalized: true,
      orderingOpen: false,
    });

    assert.match(reason?.description ?? "", /finalized/);
  });

  it("returns null when ordering is open", () => {
    assert.equal(
      getOrderingClosedReason({
        orderWeekday: 2,
        businessDayOpen: true,
        businessDayClosure: null,
        periodFinalized: false,
        orderingOpen: true,
      }),
      null,
    );
  });

  it("returns cutoff reason when the window is closed", () => {
    const reason = getOrderingClosedReason({
      orderWeekday: 3,
      businessDayOpen: true,
      businessDayClosure: null,
      periodFinalized: false,
      orderingOpen: false,
    });

    assert.match(reason?.description ?? "", /window has closed/);
  });
});

describe("canEditOrder", () => {
  it("allows editing only for submitted orders while ordering is open", () => {
    assert.equal(canEditOrder("submitted", true), true);
    assert.equal(canEditOrder("submitted", false), false);
    assert.equal(canEditOrder("fulfilled", true), false);
    assert.equal(canEditOrder("cancelled", true), false);
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
