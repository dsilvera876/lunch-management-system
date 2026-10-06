import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOfficeLocationDisplayName,
  resolveInitialOfficeLocationId,
  shouldPersistDefaultOnLocationConfirm,
} from "./lunch-office-location-selection";

const locations = [
  { id: "loc-a", name: "Location A", address: null, description: null },
  { id: "loc-b", name: "Location B", address: null, description: null },
];

describe("lunch office location selection", () => {
  it("resolves the active default location id", () => {
    assert.equal(resolveInitialOfficeLocationId(locations, "loc-a", false), "loc-a");
  });

  it("updates the displayed label when selection changes", () => {
    assert.equal(getOfficeLocationDisplayName(locations, "loc-a"), "Location A");
    assert.equal(getOfficeLocationDisplayName(locations, "loc-b"), "Location B");
  });

  it("persists when replacing saved default A with B and save is checked", () => {
    assert.equal(
      shouldPersistDefaultOnLocationConfirm(true, "loc-a", "loc-b"),
      true,
    );
  });

  it("does not persist when B is selected with save unchecked (keep A as default)", () => {
    assert.equal(
      shouldPersistDefaultOnLocationConfirm(false, "loc-a", "loc-b"),
      false,
    );
  });

  it("does not persist when selecting the location that is already the default", () => {
    assert.equal(
      shouldPersistDefaultOnLocationConfirm(true, "loc-a", "loc-a"),
      false,
    );
    assert.equal(
      shouldPersistDefaultOnLocationConfirm(false, "loc-a", "loc-a"),
      false,
    );
  });

  it("persists first default when none is saved and save is checked", () => {
    assert.equal(shouldPersistDefaultOnLocationConfirm(true, null, "loc-b"), true);
    assert.equal(shouldPersistDefaultOnLocationConfirm(false, null, "loc-b"), false);
  });

  it("uses the selected location name instead of stale server fallback", () => {
    assert.equal(
      getOfficeLocationDisplayName(locations, "loc-b", "Location A"),
      "Location B",
    );
  });
});
