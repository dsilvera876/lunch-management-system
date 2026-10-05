import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  isButtonActivationKey,
  shouldBlockAriaDisabledActivation,
} from "./aria-disabled-activation";

describe("aria-disabled activation guards", () => {
  it("treats Enter and Space as button activation keys", () => {
    assert.equal(isButtonActivationKey("Enter"), true);
    assert.equal(isButtonActivationKey(" "), true);
    assert.equal(isButtonActivationKey("Spacebar"), true);
    assert.equal(isButtonActivationKey("Tab"), false);
  });

  it("blocks activation keys only when accessibilityBlocked is true", () => {
    assert.equal(shouldBlockAriaDisabledActivation(true, "Enter"), true);
    assert.equal(shouldBlockAriaDisabledActivation(true, " "), true);
    assert.equal(shouldBlockAriaDisabledActivation(false, "Enter"), false);
  });
});

describe("aria-disabled wiring in staff controls", () => {
  it("FormSubmitButton blocks click and key activation when soft blocked", () => {
    const source = readFileSync(
      new URL("../components/form-submit-button.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /shouldBlockAriaDisabledActivation/);
    assert.match(source, /onKeyDown=\{handleKeyDown\}/);
    assert.match(source, /softBlocked[\s\S]*event\.preventDefault\(\)/);
    assert.match(source, /type="submit"/);
  });

  it("MenuItemRow blocks side Add activation while waiting for main selection", () => {
    const source = readFileSync(
      new URL("../components/lunch/menu-item-row.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /aria-disabled=\{addBlocked \? true : undefined\}/);
    assert.match(source, /onKeyDown=\{handleAddKeyDown\}/);
    assert.match(source, /if \(addBlocked\)/);
    assert.match(source, /type="button"/);
  });

  it("checkout form validates before submitLunchCheckout", () => {
    const workspace = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /async function handleSubmit\(event: React\.FormEvent/);
    assert.match(workspace, /event\.preventDefault\(\)/);
    assert.match(
      workspace,
      /if \(!checkout\.canSubmit \|\| !canSubmit\)[\s\S]*return;/,
    );
    assert.match(workspace, /submitLunchCheckout\(/);
    const submitIndex = workspace.indexOf("submitLunchCheckout(");
    const guardIndex = workspace.indexOf("if (!checkout.canSubmit || !canSubmit)");
    assert.ok(guardIndex > -1 && submitIndex > guardIndex);
  });

  it("LunchCartPanel uses accessibilityBlocked instead of native disabled for invalid cart", () => {
    const cart = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(cart, /accessibilityBlocked=\{submitAccessibilityBlocked\}/);
    assert.doesNotMatch(
      cart,
      /disabled=\{!orderingOpen \|\| !canSubmit\}/,
    );
  });
});
