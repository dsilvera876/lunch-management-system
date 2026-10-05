import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolvePlaceOrderBlockedMessage } from "./lunch-checkout";

describe("staff accessibility phase A wiring", () => {
  it("provider tabs target a single mounted tabpanel id", () => {
    const selector = readFileSync(
      new URL("../components/lunch/provider-selector.tsx", import.meta.url),
      "utf8",
    );
    const menuPanel = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(selector, /LUNCH_PROVIDER_MENU_TABPANEL_ID/);
    assert.doesNotMatch(selector, /provider-panel-\$\{/);
    assert.match(menuPanel, /id=\{LUNCH_PROVIDER_MENU_TABPANEL_ID\}/);
    assert.match(selector, /useAccessibleTablist/);
    const tabHook = readFileSync(
      new URL("../hooks/use-accessible-tablist.ts", import.meta.url),
      "utf8",
    );
    assert.match(tabHook, /onKeyDown/);
    assert.match(tabHook, /resolveTabKeyboardAction/);
  });

  it("my orders tabs target a single mounted tabpanel id", () => {
    const tabs = readFileSync(
      new URL("../components/my-orders/my-orders-tabs.tsx", import.meta.url),
      "utf8",
    );
    const client = readFileSync(
      new URL("../components/my-orders/my-orders-page-client.tsx", import.meta.url),
      "utf8",
    );

    assert.match(tabs, /MY_ORDERS_TABPANEL_ID/);
    assert.match(client, /id=\{MY_ORDERS_TABPANEL_ID\}/);
    assert.doesNotMatch(client, /my-orders-panel-\$\{activeTab\}/);
  });

  it("side Add controls expose select-main-first guidance", () => {
    const menuRow = readFileSync(
      new URL("../components/lunch/menu-item-row.tsx", import.meta.url),
      "utf8",
    );
    const menuPanel = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(menuRow, /blockedUntilMainSelected/);
    assert.match(menuRow, /aria-disabled/);
    assert.match(menuRow, /aria-describedby/);
    assert.match(menuPanel, /SELECT_MAIN_BEFORE_SIDE_MESSAGE/);
  });

  it("place order uses aria-disabled guidance association", () => {
    const cart = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );
    const submit = readFileSync(
      new URL("../components/form-submit-button.tsx", import.meta.url),
      "utf8",
    );

    assert.match(cart, /accessibilityBlocked/);
    assert.match(cart, /ariaDescribedBy/);
    assert.match(submit, /aria-disabled/);
  });

  it("inline quantity announces value changes", () => {
    const quantity = readFileSync(
      new URL("../components/lunch/inline-quantity-control.tsx", import.meta.url),
      "utf8",
    );

    assert.match(quantity, /aria-live="polite"/);
    assert.match(quantity, /Quantity \$\{value\}/);
    assert.match(quantity, /aria-hidden="true"\>\{value\}/);
    assert.match(quantity, /Decrease quantity for/);
    assert.match(quantity, /Increase quantity for/);
  });

  it("staff popovers use modal focus trap primitive", () => {
    const location = readFileSync(
      new URL("../components/lunch/order-location-popover.tsx", import.meta.url),
      "utf8",
    );
    const calendar = readFileSync(
      new URL("../components/my-orders/past-order-calendar-popover.tsx", import.meta.url),
      "utf8",
    );
    const trap = readFileSync(
      new URL("../components/ui/focus-trap-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(location, /FocusTrapPopover/);
    assert.match(calendar, /FocusTrapPopover/);
    assert.match(trap, /aria-modal=\{modal \? "true" : undefined\}/);
    assert.match(trap, /handleFocusTrapKeyDown/);
    assert.match(trap, /staffModalInert/);
    assert.match(trap, /createPortal/);
  });

  it("late order success uses polite status region", () => {
    const panel = readFileSync(
      new URL("../components/dashboard/staff-late-order-request-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(panel, /role="status"/);
    assert.match(panel, /aria-live="polite"/);
    assert.match(panel, /Late order request submitted/);
    assert.match(panel, /Late order request updated/);
    assert.match(panel, /Late order request cancelled/);
  });

  it("app shell exposes skip link to main content", () => {
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );

    assert.match(shell, /Skip to main content/);
    assert.match(shell, /id="main-content"/);
    assert.match(shell, /href="#main-content"/);
  });

  it("checkout header collapse control has accessible name", () => {
    const header = readFileSync(
      new URL("../components/my-orders/checkout-header.tsx", import.meta.url),
      "utf8",
    );

    assert.match(header, /Collapse order details/);
    assert.match(header, /Expand order details/);
  });

  it("focus trap popover declares modal dialog semantics", () => {
    const trap = readFileSync(
      new URL("../components/ui/focus-trap-popover.tsx", import.meta.url),
      "utf8",
    );

    assert.match(trap, /role="dialog"/);
    assert.match(trap, /aria-modal=\{modal \? "true" : undefined\}/);
    assert.match(trap, /handleFocusTrapKeyDown/);
    assert.match(trap, /staffModalInert/);
    assert.match(trap, /focusin/);
    assert.match(trap, /createPortal/);
  });

  it("resolvePlaceOrderBlockedMessage preserves ordering-closed copy", () => {
    assert.match(
      resolvePlaceOrderBlockedMessage(false, false, null),
      /Ordering is closed/i,
    );
    assert.equal(
      resolvePlaceOrderBlockedMessage(true, false, "Choose a delivery location."),
      "Choose a delivery location.",
    );
  });
});
