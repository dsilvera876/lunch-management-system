import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatOfficeLocationLabel,
  isValidOfficeLocationName,
  normalizeOfficeLocationName,
} from "./office-locations";
import { canManageOfficeLocations } from "./roles";

describe("office location helpers", () => {
  it("normalizes office location names", () => {
    assert.equal(normalizeOfficeLocationName("  Office 1  "), "Office 1");
  });

  it("rejects empty office location names", () => {
    assert.equal(isValidOfficeLocationName("   "), false);
    assert.equal(isValidOfficeLocationName("Office 1"), true);
  });

  it("formats office location labels with optional address", () => {
    assert.equal(formatOfficeLocationLabel("Office 1"), "Office 1");
    assert.equal(
      formatOfficeLocationLabel("Office 1", "100 Main Street"),
      "Office 1 — 100 Main Street",
    );
  });
});

describe("office location capabilities", () => {
  it("allows HR, Admin, and Owner to manage office locations", () => {
    assert.equal(canManageOfficeLocations("hr"), true);
    assert.equal(canManageOfficeLocations("admin"), true);
    assert.equal(canManageOfficeLocations("owner"), true);
  });

  it("does not allow Staff or Accounts to manage office locations", () => {
    assert.equal(canManageOfficeLocations("staff"), false);
    assert.equal(canManageOfficeLocations("accounts"), false);
  });
});
