import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cutoffTimeToFormValue,
  formatJamaicaWallClockTime,
} from "./settings";

describe("formatJamaicaWallClockTime", () => {
  it("formats 16:00:00 as 4:00 PM", () => {
    assert.equal(formatJamaicaWallClockTime("16:00:00"), "4:00 PM");
  });

  it("formats 11:00:00 as 11:00 AM", () => {
    assert.equal(formatJamaicaWallClockTime("11:00:00"), "11:00 AM");
  });

  it("formats 00:00:00 as 12:00 AM", () => {
    assert.equal(formatJamaicaWallClockTime("00:00:00"), "12:00 AM");
  });

  it("formats 12:00:00 as 12:00 PM", () => {
    assert.equal(formatJamaicaWallClockTime("12:00:00"), "12:00 PM");
  });

  it("formats HH:mm without seconds", () => {
    assert.equal(formatJamaicaWallClockTime("09:30"), "9:30 AM");
  });
});

describe("cutoffTimeToFormValue", () => {
  it("normalizes HH:mm:ss to HH:mm", () => {
    assert.equal(cutoffTimeToFormValue("16:00:00"), "16:00");
  });
});
