import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOfficeLocationDisplayName,
  resolveInitialOfficeLocationId,
} from "./lunch-office-location-selection";

const locations = [
  { id: "loc-1", name: "Office 2", address: null, description: null },
  { id: "loc-2", name: "Office 3", address: null, description: null },
];

describe("lunch office location selection", () => {
  it("resolves the active default location id", () => {
    assert.equal(resolveInitialOfficeLocationId(locations, "loc-1", false), "loc-1");
  });

  it("updates the displayed label when selection changes", () => {
    assert.equal(getOfficeLocationDisplayName(locations, "loc-1"), "Office 2");
    assert.equal(getOfficeLocationDisplayName(locations, "loc-2"), "Office 3");
  });

  it("uses the selected location name instead of stale server fallback", () => {
    assert.equal(
      getOfficeLocationDisplayName(locations, "loc-2", "Office 2"),
      "Office 3",
    );
  });
});
