import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatJamaicaHeaderDate,
  getDeliveryDateForOrderDate,
  getJamaicaIsoWeekday,
  getOrderDateForDeliveryDate,
} from "./datetime";

const FORWARD_CASES: Array<[string, string]> = [
  ["2026-09-07", "2026-09-08"],
  ["2026-09-08", "2026-09-09"],
  ["2026-09-09", "2026-09-10"],
  ["2026-09-10", "2026-09-11"],
  ["2026-09-11", "2026-09-14"],
];

const INVERSE_CASES: Array<[string, string]> = [
  ["2026-09-08", "2026-09-07"],
  ["2026-09-09", "2026-09-08"],
  ["2026-09-10", "2026-09-09"],
  ["2026-09-11", "2026-09-10"],
  ["2026-09-14", "2026-09-11"],
];

describe("business delivery calendar (TypeScript)", () => {
  it("maps every weekday order date to the next business delivery", () => {
    for (const [orderDate, deliveryDate] of FORWARD_CASES) {
      assert.equal(getDeliveryDateForOrderDate(orderDate), deliveryDate);
      assert.ok(getJamaicaIsoWeekday(orderDate));
    }
  });

  it("maps every weekday delivery date to the authoritative order date", () => {
    for (const [deliveryDate, orderDate] of INVERSE_CASES) {
      assert.equal(getOrderDateForDeliveryDate(deliveryDate), orderDate);
    }
  });

  it("round-trips forward and inverse helpers", () => {
    for (const [orderDate] of FORWARD_CASES) {
      const delivery = getDeliveryDateForOrderDate(orderDate);
      assert.equal(getOrderDateForDeliveryDate(delivery!), orderDate);
    }

    for (const [deliveryDate] of INVERSE_CASES) {
      const orderDate = getOrderDateForDeliveryDate(deliveryDate);
      assert.equal(getDeliveryDateForOrderDate(orderDate!), deliveryDate);
    }
  });

  it("returns null for weekend order and delivery dates", () => {
    assert.equal(getDeliveryDateForOrderDate("2026-09-12"), null);
    assert.equal(getDeliveryDateForOrderDate("2026-09-13"), null);
    assert.equal(getOrderDateForDeliveryDate("2026-09-12"), null);
    assert.equal(getOrderDateForDeliveryDate("2026-09-13"), null);
  });

  it("does not map Thursday order dates to the following Monday", () => {
    assert.equal(getDeliveryDateForOrderDate("2026-09-10"), "2026-09-11");
    assert.notEqual(getDeliveryDateForOrderDate("2026-09-10"), "2026-09-14");
  });
});

describe("formatJamaicaHeaderDate", () => {
  it("formats a Jamaica calendar date with weekday, month, day, and year", () => {
    assert.equal(formatJamaicaHeaderDate("2026-09-21"), "Monday, September 21, 2026");
  });
});
