import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCurrency, formatHumanDate, formatPrice } from "./format";

describe("currency formatting", () => {
  it("formats numbers as JMD currency", () => {
    assert.equal(formatCurrency(850), "$850.00");
    assert.equal(formatCurrency(1250.5), "$1,250.50");
  });

  it("handles string numbers", () => {
    assert.equal(formatCurrency("850"), "$850.00");
  });

  it("handles invalid numbers gracefully", () => {
    assert.equal(formatCurrency("invalid"), "$0.00");
  });

  it("formatPrice suppresses zero prices", () => {
    assert.equal(formatPrice(0), "");
    assert.equal(formatPrice("0.00"), "");
    assert.equal(formatPrice(850), "$850.00");
  });
});

describe("calendar date formatting", () => {
  it("formats a database date without shifting it to the previous day", () => {
    assert.equal(
      formatHumanDate("2026-09-09"),
      "Wednesday, September 9",
    );
  });

  it("preserves month boundaries", () => {
    assert.equal(
      formatHumanDate("2026-10-01"),
      "Thursday, October 1",
    );
  });

  it("preserves year boundaries", () => {
    assert.equal(
      formatHumanDate("2027-01-01"),
      "Friday, January 1",
    );
  });

  it("is independent of the runtime timezone", () => {
    const originalTimeZone = process.env.TZ;

    try {
      process.env.TZ = "Pacific/Kiritimati";
      assert.equal(
        formatHumanDate("2026-09-09"),
        "Wednesday, September 9",
      );

      process.env.TZ = "America/Los_Angeles";
      assert.equal(
        formatHumanDate("2026-09-09"),
        "Wednesday, September 9",
      );
    } finally {
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });
});
