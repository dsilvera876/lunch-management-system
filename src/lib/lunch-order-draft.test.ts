import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addSide,
  addStandalone,
  calculateDraftSubtotal,
  draftToProviderPayload,
  emptyProviderDraft,
  replaceMain,
  removeMain,
  removeSide,
  setStandaloneQuantity,
  validateProviderDraft,
} from "./lunch-order-draft";
import { hasSelectedOrderItems } from "./order-payload";
import { calculateMarginalOrderCheckout } from "./order-subsidy-preview";

const menu = [
  { id: "main-1", price: 850 },
  { id: "main-2", price: 800 },
  { id: "side-1", price: 200 },
  { id: "side-2", price: 150 },
  { id: "apple", price: 100 },
  { id: "juice", price: 200 },
];

describe("lunch order draft", () => {
  it("shows meal as incomplete when only a main is selected", () => {
    const draft = replaceMain(emptyProviderDraft(), "main-1");
    const validation = validateProviderDraft(draft);

    assert.equal(validation.mealIncomplete, true);
    assert.equal(validation.valid, false);
    assert.match(validation.message ?? "", /side/i);
    assert.equal(hasSelectedOrderItems(draftToProviderPayload(draft)), true);
  });

  it("replaces the main while keeping sides", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    draft = replaceMain(draft, "main-2");

    assert.equal(draft.mainId, "main-2");
    assert.deepEqual(draft.sideIds, ["side-1"]);
  });

  it("clears sides when the main is removed", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    draft = removeMain(draft);

    assert.equal(draft.mainId, null);
    assert.deepEqual(draft.sideIds, []);
  });

  it("applies meal quantity to the full bundle subtotal", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    draft = { ...draft, mealQuantity: 2 };

    assert.equal(calculateDraftSubtotal(draft, menu), (850 + 200) * 2);

    const payload = draftToProviderPayload(draft);
    assert.equal(payload.meal_quantity, 2);
    assert.equal(hasSelectedOrderItems(payload), true);
  });

  it("supports standalone quantities greater than one", () => {
    let draft = addStandalone(emptyProviderDraft(), "apple");
    draft = setStandaloneQuantity(draft, "apple", 3);
    draft = addStandalone(draft, "juice");
    draft = setStandaloneQuantity(draft, "juice", 2);

    assert.equal(calculateDraftSubtotal(draft, menu), 100 * 3 + 200 * 2);
    assert.deepEqual(draftToProviderPayload(draft).standalone_items, [
      { provider_menu_item_id: "apple", quantity: 3 },
      { provider_menu_item_id: "juice", quantity: 2 },
    ]);
  });

  it("removing a side updates validation until the meal is complete again", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    draft = addSide(draft, "side-2");
    assert.equal(validateProviderDraft(draft).valid, true);

    draft = removeSide(draft, "side-2");
    assert.equal(validateProviderDraft(draft).valid, true);

    draft = removeSide(draft, "side-1");
    assert.equal(validateProviderDraft(draft).mealIncomplete, true);
  });

  it("keeps subsidy preview aligned with meal and standalone totals", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    draft = { ...draft, mealQuantity: 2 };
    draft = setStandaloneQuantity(draft, "apple", 2);

    const subtotal = calculateDraftSubtotal(draft, menu);
    const checkout = calculateMarginalOrderCheckout({
      dailySubsidy: 500,
      existingOrderDateGross: 0,
      orderSubtotal: subtotal,
    });

    assert.equal(subtotal, (850 + 200) * 2 + 200);
    assert.equal(checkout.youPay, subtotal - checkout.lunchSubsidy);
  });
});
