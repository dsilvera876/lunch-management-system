import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateMarginalOrderCheckout } from "./order-subsidy-preview";

describe("calculateMarginalOrderCheckout", () => {
  it("applies full subsidy when the order fits within remaining allowance", () => {
    const result = calculateMarginalOrderCheckout({
      dailySubsidy: 500,
      existingOrderDateGross: 0,
      orderSubtotal: 300,
    });

    assert.equal(result.subtotal, 300);
    assert.equal(result.lunchSubsidy, 300);
    assert.equal(result.youPay, 0);
  });

  it("caps subsidy at the daily rate", () => {
    const result = calculateMarginalOrderCheckout({
      dailySubsidy: 500,
      existingOrderDateGross: 0,
      orderSubtotal: 800,
    });

    assert.equal(result.lunchSubsidy, 500);
    assert.equal(result.youPay, 300);
  });

  it("accounts for prior orders on the same order date", () => {
    const result = calculateMarginalOrderCheckout({
      dailySubsidy: 500,
      existingOrderDateGross: 400,
      orderSubtotal: 300,
    });

    assert.equal(result.lunchSubsidy, 100);
    assert.equal(result.youPay, 200);
  });
});
