import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_UNIT_LABEL,
  formatMenuItemLabel,
  formatOrderLineLabel,
  groupMenuItemsByType,
  isValidSpecialInstructions,
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
