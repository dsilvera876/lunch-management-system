import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildCalendarMonthGrid,
  formatPastOrderDate,
  parsePastOrderDate,
} from "./past-order-calendar";

describe("past order calendar", () => {
  it("builds a six-week grid starting on Sunday", () => {
    const grid = buildCalendarMonthGrid(2026, 9);
    assert.equal(grid.length, 42);
    assert.equal(grid[0]?.day, 30);
    assert.equal(grid[0]?.inCurrentMonth, false);
    assert.equal(grid.find((cell) => cell.date === "2026-09-01")?.day, 1);
  });

  it("formats and parses YYYY-MM-DD calendar dates", () => {
    assert.equal(formatPastOrderDate(2026, 9, 12), "2026-09-12");
    assert.deepEqual(parsePastOrderDate("2026-09-12"), {
      year: 2026,
      month: 9,
      day: 12,
    });
  });

  it("wires desktop custom calendar popover and mobile native fallback", () => {
    const pickerSource = readFileSync(
      new URL("../components/my-orders/past-order-date-picker.tsx", import.meta.url),
      "utf8",
    );
    const popoverSource = readFileSync(
      new URL("../components/my-orders/past-order-calendar-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pickerSource, /PastOrderCalendarPopover/);
    assert.match(pickerSource, /PAST_ORDER_DATE_PICKER_MOBILE_MEDIA_QUERY/);
    assert.match(pickerSource, /openNativePicker/);
    assert.match(pickerSource, /showPicker/);
    assert.match(pickerSource, /aria-expanded/);
    assert.match(pickerSource, /aria-haspopup/);
    assert.match(pickerSource, /setPopoverOpen\(false\)/);
    assert.match(pickerSource, /onChange\(value\)/);

    assert.match(popoverSource, /role="dialog"/);
    assert.match(popoverSource, /top-\[calc\(100%\+8px\)\]/);
    assert.match(popoverSource, /right-0/);
    assert.match(popoverSource, /event.key === "Escape"/);
    assert.match(popoverSource, /onSelectDate\(cell\.date\)/);
    assert.match(popoverSource, /bg-primary font-semibold text-white/);
  });
});
