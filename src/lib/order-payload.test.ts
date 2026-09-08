import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateMealBundleSubtotal,
  formatMealBundleLabel,
  hasSelectedOrderItems,
} from "./order-payload";
import { validateOrderComposition } from "./menu-items";

describe("validateOrderComposition with meal quantity", () => {
  it("accepts one main, sides, and meal quantity", () => {
    assert.deepEqual(
      validateOrderComposition({
        mainSelected: true,
        sideCount: 2,
        mealQuantity: 2,
        standaloneQuantities: [],
      }),
      { valid: true },
    );
  });

  it("accepts meal plus standalone items", () => {
    assert.deepEqual(
      validateOrderComposition({
        mainSelected: true,
        sideCount: 1,
        mealQuantity: 2,
        standaloneQuantities: [3],
      }),
      { valid: true },
    );
  });

  it("accepts standalone-only orders", () => {
    assert.deepEqual(
      validateOrderComposition({
        mainSelected: false,
        sideCount: 0,
        mealQuantity: 0,
        standaloneQuantities: [2, 4],
      }),
      { valid: true },
    );
  });

  it("rejects main without side", () => {
    const result = validateOrderComposition({
      mainSelected: true,
      sideCount: 0,
      mealQuantity: 1,
      standaloneQuantities: [],
    });
    assert.equal(result.valid, false);
    assert.match(result.message, /side/i);
  });

  it("rejects side without main", () => {
    const result = validateOrderComposition({
      mainSelected: false,
      sideCount: 1,
      mealQuantity: 1,
      standaloneQuantities: [],
    });
    assert.equal(result.valid, false);
    assert.match(result.message, /main/i);
  });

  it("rejects invalid meal quantity", () => {
    const result = validateOrderComposition({
      mainSelected: true,
      sideCount: 1,
      mealQuantity: 0,
      standaloneQuantities: [],
    });
    assert.equal(result.valid, false);
    assert.match(result.message, /meal quantity/i);
  });
});

describe("meal bundle helpers", () => {
  it("formats meal bundle labels", () => {
    assert.equal(formatMealBundleLabel(2), "Meal ×2");
  });

  it("calculates meal subtotals from component prices", () => {
    assert.equal(calculateMealBundleSubtotal(2, [12, 3, 2.5]), 35);
  });

  it("detects selected order items in payloads", () => {
    assert.equal(
      hasSelectedOrderItems({
        meal_quantity: null,
        main_provider_menu_item_id: null,
        side_provider_menu_item_ids: [],
        standalone_items: [{ provider_menu_item_id: "a", quantity: 1 }],
      }),
      true,
    );
  });
});
