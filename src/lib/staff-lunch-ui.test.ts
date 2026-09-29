import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { addSide, emptyProviderDraft, replaceMain, validateProviderDraft } from "./lunch-order-draft";

describe("staff lunch UI wiring", () => {
  it("removes duplicate dashboard date while keeping overview copy", () => {
    const dashboard = readFileSync(
      new URL("../components/dashboard/staff-dashboard.tsx", import.meta.url),
      "utf8",
    );
    const home = readFileSync(new URL("../app/home/page.tsx", import.meta.url), "utf8");
    const header = readFileSync(
      new URL("../components/app-shell/top-header.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(dashboard, /displayDateLabel/);
    assert.match(dashboard, /lunch overview/);
    assert.doesNotMatch(home, /displayDateLabel/);
    assert.match(header, /formatJamaicaHeaderDate/);
  });

  it("shows side-required guidance above the Sides heading only when needed", () => {
    const menuPanel = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(
      menuPanel,
      /validation\.mealIncomplete && draft\.mainId[\s\S]*MEAL_INCOMPLETE_GUIDANCE[\s\S]*getMenuItemTypeLabel\("side"\)/,
    );
    assert.doesNotMatch(
      menuPanel,
      /grouped\.side\.map[\s\S]*MEAL_INCOMPLETE_GUIDANCE/,
    );

    const incomplete = validateProviderDraft(replaceMain(emptyProviderDraft(), "main-1"));
    const complete = validateProviderDraft(
      addSide(replaceMain(emptyProviderDraft(), "main-1"), "side-1"),
    );
    assert.equal(incomplete.mealIncomplete, true);
    assert.equal(complete.mealIncomplete, false);
  });

  it("uses an X icon for cart Remove actions with an accessible label", () => {
    const cart = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(cart, /IconX/);
    assert.doesNotMatch(cart, /IconCircleX/);
    assert.doesNotMatch(cart, /IconCartMinus/);
    assert.doesNotMatch(cart, /aria-label=\{label\}/);
    assert.match(cart, /CartLineRemoveButton[\s\S]*Remove/);
  });

  it("loads HR-assigned provider icons for lunch tabs", () => {
    const menuLoader = readFileSync(
      new URL("./staff-provider-menu.ts", import.meta.url),
      "utf8",
    );
    const selector = readFileSync(
      new URL("../components/lunch/provider-selector.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/lunch/lunch-ordering-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(menuLoader, /icon_key/);
    assert.match(menuLoader, /parseProviderIconKey/);
    assert.match(workspace, /iconKey: provider\.iconKey/);
    assert.match(selector, /ProviderIcon iconKey=\{provider\.iconKey\}/);
    assert.doesNotMatch(selector, /storefront/);
    assert.match(menuLoader, /parseProviderIconKey\(provider\.icon_key\)/);
  });
});
