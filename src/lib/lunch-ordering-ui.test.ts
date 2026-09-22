import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { countMealIncompleteGuidanceInSummarySource } from "./lunch-order-summary-ui";
import { validateLunchCheckout } from "./lunch-checkout";
import {
  addSide,
  calculateDraftSubtotal,
  emptyProviderDraft,
  replaceMain,
} from "./lunch-order-draft";

describe("Today's Order UI contracts", () => {
  it("status header uses OPEN pill and delivery/location icons", () => {
    const source = readFileSync(
      new URL("../components/lunch/ordering-status-bar.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /rounded-full bg-emerald-50/);
    assert.match(source, /OPEN/);
    assert.match(source, /IconCalendar/);
    assert.match(source, /IconMapPin/);
    assert.match(source, /OrderLocationPopover/);
    assert.doesNotMatch(source, /window\.location/);
  });

  it("menu rows use cart Add / Added with fixed-width CTA styling", () => {
    const source = readFileSync(
      new URL("../components/lunch/menu-item-row.tsx", import.meta.url),
      "utf8",
    );
    const cartSource = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );
    const summarySource = readFileSync(
      new URL("../components/lunch/inline-quantity-control.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /Add \$\{label\}/);
    assert.match(source, /MENU_ITEM_TOGGLE_LAYOUT_CLASS/);
    assert.match(source, /w-\[7\.25rem\]/);
    assert.match(source, /MENU_ITEM_TOGGLE_ADD_CLASS/);
    assert.match(source, /IconCartPlus/);
    assert.match(source, /MENU_ITEM_TOGGLE_ADDED_CLASS/);
    assert.match(source, /IconCheck/);
    assert.match(source, />Add</);
    assert.match(source, />Added</);
    assert.doesNotMatch(source, />Remove</);
    assert.match(cartSource, /IconCartMinus/);
    assert.match(summarySource, /size-9/);
    assert.doesNotMatch(summarySource, />Add</);
  });

  it("provider menu wires add and remove handlers for mains", () => {
    const source = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /onSelectMain/);
    assert.match(source, /onFinishOrder/);
    assert.match(source, /Finish This Order/);
  });

  it("order summary uses a stable meal total row and aligned grid", () => {
    const summarySource = readFileSync(
      new URL("../components/lunch/order-summary-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(summarySource, /SUMMARY_LINE_GRID/);
    assert.match(summarySource, /Meal total/);
    assert.doesNotMatch(summarySource, /mealQuantity > 1/);
    assert.equal(countMealIncompleteGuidanceInSummarySource(summarySource), 1);
  });

  it("shows meal-incomplete guidance inline only for checkout validation", () => {
    const providers = [
      {
        id: "provider-a",
        name: "Alberries Caterors",
        description: null,
        menuItems: [{ id: "main-1", name: "Main", price: 850, itemType: "main" as const, unitLabel: "Each", displayCategory: null, description: null }],
      },
    ];
    const checkout = validateLunchCheckout(providers, {
      "provider-a": replaceMain(emptyProviderDraft(), "main-1"),
    });

    assert.equal(checkout.canSubmit, false);
    assert.equal(checkout.guidanceMessage, null);
  });

  it("uses shared shell location state and compact popover picker", () => {
    const popoverSource = readFileSync(
      new URL("../components/lunch/order-location-popover.tsx", import.meta.url),
      "utf8",
    );
    const shellSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-shell.tsx", import.meta.url),
      "utf8",
    );
    const workspaceSource = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(popoverSource, /role="dialog"/);
    assert.doesNotMatch(popoverSource, /Change delivery location/);
    assert.match(shellSource, /selectedLocationId/);
    assert.match(shellSource, /setSelectedLocationId/);
    assert.match(shellSource, /getOfficeLocationDisplayName/);
    assert.doesNotMatch(workspaceSource, /OrderLocationField/);
    assert.doesNotMatch(workspaceSource, /OfficeLocationPicker/);
    assert.match(workspaceSource, /officeLocationId: selectedOfficeLocationId/);
    assert.match(workspaceSource, /selectedOfficeLocationId/);
  });

  it("meal quantity subtotal scales without changing bundle rules", () => {
    let draft = replaceMain(emptyProviderDraft(), "main-1");
    draft = addSide(draft, "side-1");
    draft = { ...draft, mealQuantity: 2 };
    const menu = [
      { id: "main-1", price: 850 },
      { id: "side-1", price: 0 },
    ];
    assert.equal(calculateDraftSubtotal(draft, menu), 850 * 2);
  });
});
