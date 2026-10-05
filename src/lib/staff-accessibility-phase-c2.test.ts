import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  MENU_ITEM_ROW_NARROW_MEDIA,
  STAFF_CART_STICKY_PANEL_CLASS,
} from "./staff-layout-reflow";

describe("Phase C2 staff layout reflow", () => {
  it("provider tabs wrap long names instead of truncating", () => {
    const selector = readFileSync(
      new URL("../components/lunch/provider-selector.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(selector, /truncate/);
    assert.doesNotMatch(selector, /line-clamp-/);
    assert.match(selector, /whitespace-normal/);
    assert.match(selector, /role="tablist"/);
    assert.match(selector, /useAccessibleTablist/);
    assert.match(selector, /LUNCH_PROVIDER_MENU_TABPANEL_ID/);
  });

  it("menu rows stack on narrow viewports while preserving Add guidance", () => {
    const row = readFileSync(
      new URL("../components/lunch/menu-item-row.tsx", import.meta.url),
      "utf8",
    );
    assert.match(row, /MENU_ITEM_ROW_ROOT_CLASS/);
    assert.match(row, /sm:flex-row/);
    assert.match(row, /blockedUntilMainSelected/);
    assert.match(row, /aria-describedby/);
    assert.match(row, /break-words/);
  });

  it("past order date visible label is not truncated", () => {
    const picker = readFileSync(
      new URL("../components/my-orders/past-order-date-picker.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(picker, /truncate/);
    assert.match(picker, /whitespace-normal/);
    assert.match(picker, /past-order-date-value/);
    assert.match(picker, /showPicker/);
  });

  it("edit submit bar avoids viewport-bottom sticky overlay", () => {
    const form = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );
    assert.match(form, /STAFF_EDIT_SUBMIT_BAR_CLASS/);
    assert.doesNotMatch(form, /sticky bottom-4/);
  });

  it("lunch cart wires short-viewport sticky/max-height overrides", () => {
    const cart = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("../app/staff-accessibility.css", import.meta.url),
      "utf8",
    );
    assert.match(cart, /STAFF_CART_STICKY_PANEL_CLASS/);
    assert.match(css, new RegExp(STAFF_CART_STICKY_PANEL_CLASS));
    assert.match(css, /max-height: 40rem/);
  });

  it("documents narrow menu row media query constant", () => {
    assert.equal(MENU_ITEM_ROW_NARROW_MEDIA, "(max-width: 639px)");
  });
});
