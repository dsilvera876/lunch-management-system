import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getNavForRole,
  getPostLoginPath,
  STAFF_NAV,
  HR_NAV,
  ACCOUNTS_NAV,
  ADMIN_NAV,
} from "./navigation";
import {
  canFulfillOrders,
  canManageLunchPeriods,
  canManageProviders,
  canManageRoles,
  canViewAllOrders,
  getRoleLabel,
} from "./roles";

describe("getRoleLabel", () => {
  it("returns clean labels for all roles", () => {
    assert.equal(getRoleLabel("staff"), "Staff");
    assert.equal(getRoleLabel("hr"), "HR");
    assert.equal(getRoleLabel("accounts"), "Accounts");
    assert.equal(getRoleLabel("admin"), "Admin");
    assert.equal(getRoleLabel("owner"), "Owner");
  });
});

describe("capability helpers", () => {
  it("allows HR to manage providers and fulfill but not manage roles", () => {
    assert.equal(canManageProviders("hr"), true);
    assert.equal(canFulfillOrders("hr"), true);
    assert.equal(canManageRoles("hr"), false);
  });

  it("allows Accounts to view all orders but not fulfill or manage providers", () => {
    assert.equal(canViewAllOrders("accounts"), true);
    assert.equal(canFulfillOrders("accounts"), false);
    assert.equal(canManageProviders("accounts"), false);
  });

  it("allows Admin and Owner to manage roles", () => {
    assert.equal(canManageRoles("admin"), true);
    assert.equal(canManageRoles("owner"), true);
  });
});

describe("navigation by role", () => {
  it("includes Home for staff", () => {
    assert.ok(STAFF_NAV.some((item) => item.href === "/home"));
  });

  it("includes providers and orders for HR", () => {
    assert.ok(HR_NAV.some((item) => item.href === "/admin/providers"));
    assert.ok(HR_NAV.some((item) => item.href === "/admin/orders"));
    assert.ok(!HR_NAV.some((item) => item.href === "/admin/users"));
  });

  it("includes orders but not providers for Accounts", () => {
    assert.ok(ACCOUNTS_NAV.some((item) => item.href === "/admin/orders"));
    assert.ok(!ACCOUNTS_NAV.some((item) => item.href === "/admin/providers"));
  });

  it("includes lunch periods for HR and Accounts but not Staff", () => {
    assert.ok(HR_NAV.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(ACCOUNTS_NAV.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(!STAFF_NAV.some((item) => item.href === "/admin/lunch-periods"));
  });

  it("allows HR to manage lunch periods", () => {
    assert.equal(canManageLunchPeriods("hr"), true);
    assert.equal(canManageLunchPeriods("staff"), false);
  });

  it("includes user management for Admin", () => {
    assert.ok(ADMIN_NAV.some((item) => item.href === "/admin/users"));
  });

  it("returns role-specific navigation", () => {
    assert.deepEqual(
      getNavForRole("staff").map((item) => item.href),
      STAFF_NAV.map((item) => item.href),
    );
    assert.ok(getNavForRole("hr").some((item) => item.label === "Lunch Providers"));
  });
});

describe("getPostLoginPath", () => {
  it("sends staff-like roles to home and admin roles to dashboard", () => {
    assert.equal(getPostLoginPath("staff"), "/home");
    assert.equal(getPostLoginPath("hr"), "/home");
    assert.equal(getPostLoginPath("accounts"), "/home");
    assert.equal(getPostLoginPath("admin"), "/admin");
    assert.equal(getPostLoginPath("owner"), "/admin");
  });
});
