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
  canExportFinancialSummaries,
  canFinalizeLunchPeriods,
  canUpdateDailyLunchSubsidy,
  canFulfillOrders,
  canManageLunchPeriods,
  canManageProviders,
  canManageOfficeLocations,
  canManageRoles,
  canViewAllFinancialSummaries,
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
    assert.equal(canManageOfficeLocations("hr"), true);
    assert.equal(canFulfillOrders("hr"), true);
    assert.equal(canManageRoles("hr"), false);
  });

  it("does not allow Accounts to manage office locations", () => {
    assert.equal(canManageOfficeLocations("accounts"), false);
    assert.equal(canManageOfficeLocations("staff"), false);
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
    assert.ok(HR_NAV.some((item) => item.href === "/admin/locations"));
    assert.ok(!HR_NAV.some((item) => item.href === "/admin/users"));
  });

  it("includes orders but not providers for Accounts", () => {
    assert.ok(ACCOUNTS_NAV.some((item) => item.href === "/admin/orders"));
    assert.ok(!ACCOUNTS_NAV.some((item) => item.href === "/admin/providers"));
    assert.ok(!ACCOUNTS_NAV.some((item) => item.href === "/admin/locations"));
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

  it("includes financial summaries for HR and Accounts but not export-only staff routes", () => {
    assert.ok(HR_NAV.some((item) => item.href === "/admin/financials"));
    assert.ok(ACCOUNTS_NAV.some((item) => item.href === "/admin/financials"));
    assert.ok(STAFF_NAV.some((item) => item.href === "/financials"));
    assert.ok(!STAFF_NAV.some((item) => item.href === "/admin/financials"));
  });

  it("allows HR to view but not export or finalize financial summaries", () => {
    assert.equal(canViewAllFinancialSummaries("hr"), true);
    assert.equal(canExportFinancialSummaries("hr"), false);
    assert.equal(canFinalizeLunchPeriods("hr"), false);
  });

  it("allows Accounts to view, export, and finalize financial summaries", () => {
    assert.equal(canViewAllFinancialSummaries("accounts"), true);
    assert.equal(canExportFinancialSummaries("accounts"), true);
    assert.equal(canFinalizeLunchPeriods("accounts"), true);
    assert.equal(canUpdateDailyLunchSubsidy("accounts"), true);
  });

  it("allows HR to read but not update daily lunch subsidy", () => {
    assert.equal(canUpdateDailyLunchSubsidy("hr"), false);
    assert.equal(canUpdateDailyLunchSubsidy("staff"), false);
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
