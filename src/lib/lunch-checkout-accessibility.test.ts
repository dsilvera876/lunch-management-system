import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CHECKOUT_LOCATION_REQUIRED_MESSAGE,
  LOCATION_PICKER_SELECTION_REQUIRED_MESSAGE,
  formatCartEntryRemoveLabel,
  formatCartEntryRemovedAnnouncement,
  formatCartLineRemoveLabel,
  formatCartLineRemovedAnnouncement,
  resolveCheckoutBlock,
  resolveLocationPickerConfirmation,
  resolveRemovalFocusIndex,
  withAnnouncementNonce,
} from "./lunch-checkout-accessibility";

function readComponent(path: string): string {
  return readFileSync(new URL(`../components/${path}`, import.meta.url), "utf8");
}

const ready = {
  orderingOpen: true,
  locationRequired: false,
  unfinishedDraftMessage: null,
  cartReady: true,
  canSubmit: true,
  guidanceMessage: null,
};

describe("resolveCheckoutBlock", () => {
  it("allows checkout when every guard passes", () => {
    assert.equal(resolveCheckoutBlock(ready), null);
  });

  it("reports closed ordering before any other problem", () => {
    const block = resolveCheckoutBlock({
      ...ready,
      orderingOpen: false,
      locationRequired: true,
      canSubmit: false,
    });
    assert.equal(block?.kind, "closed");
    assert.match(block?.message ?? "", /Ordering is closed/);
  });

  it("asks for a delivery location before unfinished orders", () => {
    const block = resolveCheckoutBlock({
      ...ready,
      locationRequired: true,
      unfinishedDraftMessage: "Finish your Alberries order.",
      canSubmit: false,
    });
    assert.deepEqual(block, { kind: "location", message: CHECKOUT_LOCATION_REQUIRED_MESSAGE });
  });

  it("names unfinished orders", () => {
    const block = resolveCheckoutBlock({
      ...ready,
      unfinishedDraftMessage: "Finish your Alberries order.",
      canSubmit: false,
    });
    assert.deepEqual(block, { kind: "unfinished", message: "Finish your Alberries order." });
  });

  it("uses cart guidance when the cart is not ready", () => {
    const block = resolveCheckoutBlock({
      ...ready,
      cartReady: false,
      canSubmit: false,
      guidanceMessage: "Add at least one order to your lunch cart.",
    });
    assert.deepEqual(block, {
      kind: "cart",
      message: "Add at least one order to your lunch cart.",
    });
  });

  it("falls back to a generic correction when no guidance is available", () => {
    const block = resolveCheckoutBlock({ ...ready, canSubmit: false });
    assert.equal(block?.kind, "cart");
    assert.match(block?.message ?? "", /Complete your lunch cart/);
  });
});

describe("resolveRemovalFocusIndex", () => {
  it("keeps the same position when a later control exists", () => {
    assert.equal(resolveRemovalFocusIndex(3, 1), 1);
  });

  it("moves to the previous control when the last one was removed", () => {
    assert.equal(resolveRemovalFocusIndex(2, 2), 1);
  });

  it("handles several controls disappearing at once", () => {
    assert.equal(resolveRemovalFocusIndex(1, 3), 0);
  });

  it("returns null when no remove controls remain", () => {
    assert.equal(resolveRemovalFocusIndex(0, 0), null);
  });

  it("falls back to the first control when the origin is unknown", () => {
    assert.equal(resolveRemovalFocusIndex(2, -1), 0);
  });
});

describe("cart announcements", () => {
  it("formats removal messages", () => {
    assert.equal(
      formatCartLineRemovedAnnouncement("Curry Chicken", "Alberries"),
      "Curry Chicken removed from your Alberries order.",
    );
    assert.equal(
      formatCartEntryRemovedAnnouncement("Alberries", 2),
      "Alberries order 2 removed from your lunch cart.",
    );
    assert.equal(
      formatCartLineRemoveLabel("Curry Chicken", "Alberries"),
      "Remove Curry Chicken from Alberries order",
    );
    assert.equal(
      formatCartEntryRemoveLabel("Alberries", 2),
      "Remove Alberries order 2 from lunch cart",
    );
  });

  it("changes the live text for a repeated identical message", () => {
    const first = withAnnouncementNonce("Removed.", 1);
    const second = withAnnouncementNonce("Removed.", 2);
    assert.notEqual(first, second);
    assert.equal(first.trim(), second.trim());
    assert.equal(withAnnouncementNonce("", 3), "");
  });
});

describe("resolveLocationPickerConfirmation", () => {
  it("confirms an available location", () => {
    assert.deepEqual(resolveLocationPickerConfirmation("loc-1", ["loc-1", "loc-2"]), {
      ok: true,
      locationId: "loc-1",
    });
  });

  it("rejects an empty or unknown selection", () => {
    for (const pending of ["", "missing"]) {
      assert.deepEqual(resolveLocationPickerConfirmation(pending, ["loc-1"]), {
        ok: false,
        message: LOCATION_PICKER_SELECTION_REQUIRED_MESSAGE,
      });
    }
  });
});

describe("Staff checkout focus retention (source)", () => {
  it("keeps the Added toggle focusable instead of natively disabled", () => {
    const row = readComponent("lunch/menu-item-row.tsx");
    assert.match(row, /disabled=\{disabled\}\s*aria-disabled=\{disabled \? undefined : true\}/);
    assert.doesNotMatch(row, /<button\s+type="button"\s+disabled\s/);
  });

  it("keeps quantity buttons focusable at their bounds", () => {
    const quantity = readComponent("lunch/inline-quantity-control.tsx");
    assert.match(quantity, /aria-disabled=\{!disabled && atMin \? true : undefined\}/);
    assert.match(quantity, /aria-disabled=\{!disabled && atMax \? true : undefined\}/);
    assert.doesNotMatch(quantity, /disabled=\{disabled \|\| value/);
    assert.match(quantity, /aria-live="polite"/);
  });

  it("moves focus deliberately after cart changes and announces once", () => {
    const cart = readComponent("lunch/lunch-cart-panel.tsx");
    assert.match(cart, /data-cart-entry-heading=\{entry\.id\}/);
    assert.match(cart, /resolveRemovalFocusIndex\(buttons\.length, request\.index\)/);
    assert.match(cart, /pendingFocus\.current = \{ kind: "heading" \}/);
    assert.equal(cart.match(/data-cart-announcer/g)?.length, 1);
  });

  it("guards against double submission while pending", () => {
    const workspace = readComponent("lunch/lunch-ordering-workspace.tsx");
    assert.match(workspace, /if \(submittingRef\.current \|\| explainCheckoutBlock\(\)\)/);
  });
});

describe("Delivery location picker requires explicit confirmation (source)", () => {
  it("does not apply the location from the select change handler", () => {
    const popover = readComponent("lunch/order-location-popover.tsx");
    const onChange = popover.match(/onChange=\{\(event\) => \{([\s\S]*?)\}\}/)?.[1] ?? "";
    assert.match(onChange, /setPendingLocationId\(event\.target\.value\)/);
    assert.doesNotMatch(onChange, /onConfirmLocation/);
    assert.match(popover, /Use this location/);
    assert.match(popover, /onConfirmLocation\(result\.locationId, pendingSaveAsDefault\)/);
  });

  it("keeps the save-as-default choice pending until confirmation", () => {
    const popover = readComponent("lunch/order-location-popover.tsx");
    assert.match(popover, /checked=\{pendingSaveAsDefault\}/);
    assert.doesNotMatch(popover, /onSaveAsDefaultChange/);
  });

  it("explains why the picker opened from Place Order", () => {
    const popover = readComponent("lunch/order-location-popover.tsx");
    const shell = readComponent("lunch/lunch-ordering-shell.tsx");
    assert.match(popover, /describedById=\{notice \? noticeId : undefined\}/);
    assert.match(shell, /setLocationPickerNotice\(notice\)/);
  });
});
