import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_UNIT_LABEL,
  formatDisplayCategoryCount,
  formatMenuItemLabel,
  formatOrderLineLabel,
  groupMenuItemsByType,
  groupStandaloneItemsByCategory,
  isValidSpecialInstructions,
  normalizeDisplayCategory,
  normalizeSpecialInstructions,
  providerOffersMeals,
} from "./menu-items";

describe("menu item presentation helpers", () => {
  it("formats unit labels when they differ from Each", () => {
    assert.equal(
      formatMenuItemLabel("Red Seedless Grapes", "1/4 LB"),
      "Red Seedless Grapes (1/4 LB)",
    );
    assert.equal(formatMenuItemLabel("Banana", DEFAULT_UNIT_LABEL), "Banana");
  });

  it("formats order line labels with quantity", () => {
    assert.equal(
      formatOrderLineLabel("Coconut Water", "Bottle", 2),
      "Coconut Water (Bottle) × 2",
    );
  });

  it("groups menu items by type", () => {
    const grouped = groupMenuItemsByType([
      { id: "1", itemType: "main" as const },
      { id: "2", itemType: "side" as const },
      { id: "3", itemType: "standalone" as const },
    ]);

    assert.equal(grouped.main.length, 1);
    assert.equal(grouped.side.length, 1);
    assert.equal(grouped.standalone.length, 1);
  });

  it("groups standalone items by display category", () => {
    const grouped = groupStandaloneItemsByCategory([
      { id: "1", itemType: "standalone" as const, displayCategory: "Juice" },
      { id: "2", itemType: "standalone" as const, displayCategory: " juices " },
      { id: "3", itemType: "standalone" as const, displayCategory: null },
      { id: "4", itemType: "standalone" as const, displayCategory: "  " },
      { id: "5", itemType: "standalone" as const, displayCategory: "FRUIT" },
    ]);

    assert.equal(grouped.Juices.length, 2);
    assert.equal(grouped["Other items"].length, 2);
    assert.equal(grouped.Fruit.length, 1);
  });

  it("distinguishes an unset category from the literal Other category", () => {
    assert.equal(normalizeDisplayCategory("Other"), "Other");
    assert.equal(normalizeDisplayCategory(""), null);
    assert.equal(normalizeDisplayCategory(null), null);
  });

  it("uses customer-friendly provider category counts", () => {
    assert.equal(formatDisplayCategoryCount("Fruit", 3), "3 Fruit items");
    assert.equal(formatDisplayCategoryCount("Juices", 2), "2 Juices");
    assert.equal(formatDisplayCategoryCount("Juices", 1), "1 Juice");
    assert.equal(formatDisplayCategoryCount("Other items", 1), "1 Other item");
  });

  it("detects whether a provider offers meals", () => {
    assert.equal(
      providerOffersMeals([{ itemType: "standalone" }, { itemType: "standalone" }]),
      false,
    );
    assert.equal(
      providerOffersMeals([{ itemType: "main" }, { itemType: "standalone" }]),
      true,
    );
  });
});

describe("special instructions helpers", () => {
  it("trims surrounding whitespace", () => {
    assert.equal(normalizeSpecialInstructions("  Extra gravy  "), "Extra gravy");
  });

  it("accepts instructions up to 500 characters", () => {
    assert.equal(isValidSpecialInstructions("a".repeat(500)), true);
    assert.equal(isValidSpecialInstructions("a".repeat(501)), false);
  });
});
