import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("OfficeLocationPicker", () => {
  it("supports disabling default-location updates for HR flows", () => {
    const pickerSource = readFileSync(
      new URL("../components/office-location-picker.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pickerSource, /allowDefaultLocationUpdate/);
    assert.match(pickerSource, /Delivery location for this order/);

    const hrBranch =
      pickerSource.split("if (!allowDefaultLocationUpdate)")[1]?.split("\n  }\n\n  return")[0] ??
      "";

    assert.doesNotMatch(hrBranch, /Save as my default delivery location/);
    assert.doesNotMatch(hrBranch, /saveAsDefault/);
    assert.match(pickerSource, /Save as my default delivery location/);
  });

  it("staff lunch flow still supports saving a default location", () => {
    const lunchActions = readFileSync(
      new URL("../app/lunch/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(lunchActions, /saveAsDefault === "on"/);
  });
});
