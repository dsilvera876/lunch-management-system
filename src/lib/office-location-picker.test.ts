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
    assert.match(pickerSource, /Delivery Location/);
    assert.match(pickerSource, /does not change anyone/);

    const hrBranch =
      pickerSource
        .split("if (!allowDefaultLocationUpdate)")[1]
        ?.split("\n  }\n\n  const sectionClassName")[0] ?? "";

    assert.doesNotMatch(hrBranch, /Save as my default delivery location/);
    assert.doesNotMatch(hrBranch, /saveAsDefault/);
    assert.match(pickerSource, /Save as my default delivery location/);
  });

  it("staff lunch flow still supports saving a default location", () => {
    const lunchActions = readFileSync(
      new URL("../app/lunch/actions.ts", import.meta.url),
      "utf8",
    );
    const accountActions = readFileSync(
      new URL("../app/account/actions.ts", import.meta.url),
      "utf8",
    );
    const lunchShell = readFileSync(
      new URL("../components/lunch/lunch-ordering-shell.tsx", import.meta.url),
      "utf8",
    );
    const statusBar = readFileSync(
      new URL("../components/lunch/ordering-status-bar.tsx", import.meta.url),
      "utf8",
    );

    assert.match(lunchActions, /saveMyDefaultOfficeLocation/);
    assert.match(accountActions, /set_my_default_office_location/);
    assert.match(lunchShell, /saveMyDefaultOfficeLocation/);
    assert.match(lunchShell, /shouldPersistDefaultOnLocationConfirm\([\s\S]*selectedLocationId/);
    assert.match(lunchShell, /showSaveAsDefault/);
    assert.doesNotMatch(
      readFileSync(
        new URL("../components/lunch/order-location-popover.tsx", import.meta.url),
        "utf8",
      ),
      /defaultLocationId === null \?/,
    );
    assert.match(lunchShell, /defaultSaveError/);
    assert.match(statusBar, /role="alert"/);
  });

  it("account preferences read the same profiles default column", () => {
    const accountPage = readFileSync(
      new URL("../app/account/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(accountPage, /default_office_location_id/);
  });
});
