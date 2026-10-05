import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LUNCH_PROVIDER_MENU_TABPANEL_ID,
  MY_ORDERS_TABPANEL_ID,
  resolveNextTabIndex,
  resolveTabKeyboardAction,
  rovingTabIndex,
  SELECT_MAIN_BEFORE_SIDE_MESSAGE,
} from "./accessible-tabs";

describe("accessible tabs helpers", () => {
  it("assigns roving tabIndex for selected tab only", () => {
    assert.equal(rovingTabIndex(true), 0);
    assert.equal(rovingTabIndex(false), -1);
  });

  it("maps arrow and home/end keys to tab actions", () => {
    assert.equal(resolveTabKeyboardAction("ArrowRight"), "next");
    assert.equal(resolveTabKeyboardAction("ArrowLeft"), "previous");
    assert.equal(resolveTabKeyboardAction("Home"), "first");
    assert.equal(resolveTabKeyboardAction("End"), "last");
    assert.equal(resolveTabKeyboardAction("Enter"), null);
  });

  it("wraps tab indices for next and previous", () => {
    assert.equal(resolveNextTabIndex(0, 3, "next"), 1);
    assert.equal(resolveNextTabIndex(2, 3, "next"), 0);
    assert.equal(resolveNextTabIndex(0, 3, "previous"), 2);
    assert.equal(resolveNextTabIndex(1, 3, "first"), 0);
    assert.equal(resolveNextTabIndex(1, 3, "last"), 2);
  });

  it("uses stable shared tabpanel ids", () => {
    assert.equal(LUNCH_PROVIDER_MENU_TABPANEL_ID, "lunch-provider-menu-tabpanel");
    assert.equal(MY_ORDERS_TABPANEL_ID, "my-orders-tabpanel");
  });

  it("documents side-item prerequisite copy", () => {
    assert.match(SELECT_MAIN_BEFORE_SIDE_MESSAGE, /Select a main item first/i);
  });
});
