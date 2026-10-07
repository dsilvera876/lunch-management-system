import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  resolveLateOrderEligibilityOfficeLocationId,
  resolveLateOrderSaveAsDefaultCheckboxState,
  resolveLateOrderSaveAsDefaultOnLocationChange,
  shouldSaveDefaultOnLateOrderSubmit,
} from "./staff-late-order-location-save";

const locA = "loc-a";
const locB = "loc-b";

describe("late-order save-as-default checkbox matrix", () => {
  it("A: no location selected -> visible, unchecked, disabled", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(locA, ""), {
      checked: false,
      disabled: true,
    });
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(null, ""), {
      checked: false,
      disabled: true,
    });
  });

  it("B: no saved default + location selected -> enabled, checked by default", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(null, locA), {
      checked: true,
      disabled: false,
    });
    assert.equal(resolveLateOrderSaveAsDefaultOnLocationChange(null, locA), true);
  });

  it("C: selected location equals saved default -> checked, disabled, no save RPC", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(locA, locA), {
      checked: true,
      disabled: true,
    });
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(true, locA, locA), false);
  });

  it("D: saved default A + selected B -> enabled, unchecked by default", () => {
    assert.deepEqual(resolveLateOrderSaveAsDefaultCheckboxState(locA, locB), {
      checked: false,
      disabled: false,
    });
    assert.equal(resolveLateOrderSaveAsDefaultOnLocationChange(locA, locB), false);
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(false, locA, locB), false);
    assert.equal(shouldSaveDefaultOnLateOrderSubmit(true, locA, locB), true);
  });
});

describe("inactive saved default office location", () => {
  it("treats inactive saved default as no usable default for eligibility RPC", () => {
    assert.equal(resolveLateOrderEligibilityOfficeLocationId("loc-a", true), null);
    assert.equal(resolveLateOrderEligibilityOfficeLocationId("loc-a", false), "loc-a");
    assert.equal(resolveLateOrderEligibilityOfficeLocationId(null, false), null);
  });
});

describe("late-order submit partial failure handling", () => {
  it("reports default save warning without blocking successful request outcome", () => {
    const actions = readFileSync(
      new URL("../app/home/staff-late-order-request-actions.ts", import.meta.url),
      "utf8",
    );
    const createAction = actions.slice(
      actions.indexOf("export async function createStaffLateOrderRequestAction"),
    );
    assert.match(createAction, /defaultSaveWarning = LATE_ORDER_DEFAULT_SAVE_WARNING/);
    assert.match(createAction, /return \{ ok: true, requestId: String\(data\), defaultSaveWarning \}/);
  });
});
