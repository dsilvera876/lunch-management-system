import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validateLunchCheckout } from "./lunch-checkout";
import { addSide, emptyProviderDraft, replaceMain } from "./lunch-order-draft";

const providers = [
  {
    id: "provider-a",
    name: "Alberries Caterors",
    description: null,
    menuItems: [
      {
        id: "main-1",
        name: "Main",
        price: 850,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        description: null,
      },
      {
        id: "side-1",
        name: "Side",
        price: 0,
        itemType: "side" as const,
        unitLabel: "Each",
        displayCategory: null,
        description: null,
      },
    ],
  },
  {
    id: "provider-b",
    name: "Davis Catering",
    description: null,
    menuItems: [
      {
        id: "main-2",
        name: "Main Two",
        price: 900,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        description: null,
      },
      {
        id: "side-2",
        name: "Side Two",
        price: 0,
        itemType: "side" as const,
        unitLabel: "Each",
        displayCategory: null,
        description: null,
      },
    ],
  },
];

describe("combined order summary guidance", () => {
  it("does not duplicate meal-incomplete guidance globally", () => {
    const checkout = validateLunchCheckout(providers, {
      "provider-a": replaceMain(emptyProviderDraft(), "main-1"),
    });

    assert.equal(checkout.canSubmit, false);
    assert.equal(checkout.guidanceMessage, null);
  });

  it("shows meal-incomplete guidance in builder and cart guidance separately", () => {
    const menuSource = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );
    const cartSource = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(menuSource, /MEAL_INCOMPLETE_GUIDANCE/);
    assert.match(cartSource, /Lunch Cart/);
    assert.match(cartSource, /guidanceMessage && !canSubmit/);
  });

  it("still surfaces non-inline composition errors globally", () => {
    const checkout = validateLunchCheckout(providers, {
      "provider-a": addSide(emptyProviderDraft(), "side-1"),
    });

    assert.equal(checkout.canSubmit, false);
    assert.match(checkout.guidanceMessage ?? "", /Alberries Caterors/);
  });

  it("supports two providers each with inline meal-incomplete guidance", () => {
    const checkout = validateLunchCheckout(providers, {
      "provider-a": replaceMain(emptyProviderDraft(), "main-1"),
      "provider-b": replaceMain(emptyProviderDraft(), "main-2"),
    });

    assert.equal(checkout.canSubmit, false);
    assert.equal(checkout.guidanceMessage, null);
    assert.equal(
      checkout.entries.filter((entry) => entry.validation.mealIncomplete).length,
      2,
    );
  });
});
