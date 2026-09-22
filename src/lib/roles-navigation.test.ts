import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessRoute,
  getNavForRole,
  getPostLoginPath,
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

  it("does not allow Accounts to manage office locations or view all orders", () => {
    assert.equal(canManageOfficeLocations("accounts"), false);
    assert.equal(canManageOfficeLocations("staff"), false);
    assert.equal(canViewAllOrders("accounts"), false);
  });

  it("allows HR to view all orders but not financial summaries", () => {
    assert.equal(canViewAllOrders("hr"), true);
    assert.equal(canViewAllFinancialSummaries("hr"), false);
    assert.equal(canManageProviders("accounts"), false);
    assert.equal(canFulfillOrders("accounts"), false);
  });

  it("allows Admin and Owner to manage roles and access both tool groups", () => {
    assert.equal(canManageRoles("admin"), true);
    assert.equal(canManageRoles("owner"), true);
    assert.equal(canViewAllOrders("admin"), true);
    assert.equal(canViewAllFinancialSummaries("admin"), true);
    assert.equal(canViewAllOrders("owner"), true);
    assert.equal(canViewAllFinancialSummaries("owner"), true);
  });
});

describe("navigation by role", () => {
  it("includes Dashboard for staff without management groups", () => {
    const nav = getNavForRole("staff");
    const mainGroup = nav.find((g) => g.label === "MAIN");
    assert.ok(mainGroup?.items.some((item) => item.href === "/home"));
    const todaysOrder = mainGroup?.items.find((item) => item.href === "/lunch");
    assert.equal(todaysOrder?.icon, "utensils");
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
  });

  it("shows HR tools items for HR", () => {
    const nav = getNavForRole("hr");
    const hrTools = nav.find((g) => g.label === "HR TOOLS");
    const todaysOrders = hrTools?.items.find((item) => item.href === "/admin/todays-orders");
    assert.ok(todaysOrders);
    assert.equal(todaysOrders?.icon, "utensils");
    assert.ok(hrTools?.items.some((item) => item.href === "/admin/late-orders"));
    assert.ok(hrTools?.items.some((item) => item.href === "/admin/deliveries"));
    assert.ok(hrTools?.items.some((item) => item.label === "Order History"));
    assert.ok(hrTools?.items.some((item) => item.href === "/admin/settings"));
    assert.ok(!hrTools?.items.some((item) => item.href === "/admin/locations"));
    assert.ok(nav.find((g) => g.label === "MAIN")?.items.some((item) => item.href === "/financials"));
    assert.ok(!nav.find((g) => g.label === "ACCOUNTS"));
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
  });

  it("shows Accounts group for Accounts", () => {
    const nav = getNavForRole("accounts");
    const accounts = nav.find((g) => g.label === "ACCOUNTS");
    assert.ok(accounts?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(accounts?.items.some((item) => item.href === "/admin/financials"));
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
    assert.ok(nav.find((g) => g.label === "MAIN")?.items.some((item) => item.href === "/my-orders"));
  });

  it("shows ACCOUNTS, HR TOOLS, and ADMIN for Admin and Owner", () => {
    for (const role of ["admin", "owner"] as const) {
      const nav = getNavForRole(role);
      assert.ok(nav.find((g) => g.label === "ACCOUNTS"));
      assert.ok(nav.find((g) => g.label === "HR TOOLS"));
      assert.ok(nav.find((g) => g.label === "ADMIN"));
    }
  });

  it("shows Lunch Periods only to Accounts, Admin, and Owner", () => {
    const hrNav = getNavForRole("hr");
    const accountsNav = getNavForRole("accounts");
    const adminNav = getNavForRole("admin");
    const ownerNav = getNavForRole("owner");
    const staffNav = getNavForRole("staff");

    assert.ok(!hrNav.flatMap((group) => group.items).some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(accountsNav.find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(adminNav.find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(ownerNav.find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(!staffNav.find((g) => g.label === "ADMIN"));
  });

  it("does not duplicate Lunch Periods across navigation groups", () => {
    for (const role of ["accounts", "admin", "owner"]) {
      const matches = getNavForRole(role)
        .flatMap((group) => group.items)
        .filter((item) => item.href === "/admin/lunch-periods");

      assert.equal(matches.length, 1);
    }
  });

  it("restricts lunch-period management routes to Accounts, Admin, and Owner", () => {
    assert.equal(canManageLunchPeriods("hr"), false);
    assert.equal(canManageLunchPeriods("staff"), false);
    assert.equal(canManageLunchPeriods("accounts"), true);
    assert.equal(canManageLunchPeriods("admin"), true);
    assert.equal(canManageLunchPeriods("owner"), true);
    assert.equal(canAccessRoute("hr", "/admin/lunch-periods"), false);
    assert.equal(canAccessRoute("staff", "/admin/lunch-periods"), false);
    assert.equal(canAccessRoute("accounts", "/admin/lunch-periods"), true);
    assert.equal(canAccessRoute("admin", "/admin/lunch-periods"), true);
    assert.equal(canAccessRoute("owner", "/admin/lunch-periods"), true);
  });

  it("includes user management only under ADMIN for Admin", () => {
    const nav = getNavForRole("admin");
    const adminGroup = nav.find((g) => g.label === "ADMIN");
    assert.ok(adminGroup?.items.some((item) => item.href === "/admin/users"));
    assert.equal(adminGroup?.items.length, 1);
    assert.ok(!adminGroup?.items.some((item) => item.href === "/admin"));
  });

  it("includes financial summaries for Accounts but not HR or staff admin routes", () => {
    const hrNav = getNavForRole("hr");
    const accountsNav = getNavForRole("accounts");
    const staffNav = getNavForRole("staff");

    assert.ok(!hrNav.flatMap((group) => group.items).some((item) => item.href === "/admin/financials"));
    assert.ok(accountsNav.find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/financials"));
    assert.ok(staffNav.find((g) => g.label === "MAIN")?.items.some((item) => item.href === "/financials"));
    assert.equal(
      staffNav.flatMap((group) => group.items).filter((item) => item.href === "/financials").length,
      1,
    );
  });

  it("allows HR settings hub for HR but not staff or accounts", () => {
    assert.equal(canAccessRoute("hr", "/admin/settings"), true);
    assert.equal(canAccessRoute("admin", "/admin/settings"), true);
    assert.equal(canAccessRoute("staff", "/admin/settings"), false);
    assert.equal(canAccessRoute("accounts", "/admin/settings"), false);
    assert.equal(canAccessRoute("hr", "/admin/locations"), true);
  });

  it("restricts HR workflow routes to HR, Admin, and Owner", () => {
    for (const path of ["/admin/todays-orders", "/admin/late-orders", "/admin/deliveries"]) {
      assert.equal(canAccessRoute("hr", path), true);
      assert.equal(canAccessRoute("admin", path), true);
      assert.equal(canAccessRoute("owner", path), true);
      assert.equal(canAccessRoute("staff", path), false);
      assert.equal(canAccessRoute("accounts", path), false);
    }
  });

  it("denies cross-group direct route access", () => {
    assert.equal(canAccessRoute("hr", "/admin/financials"), false);
    assert.equal(canAccessRoute("accounts", "/admin/orders"), false);
    assert.equal(canAccessRoute("hr", "/admin/orders"), true);
    assert.equal(canAccessRoute("hr", "/admin/deliveries"), true);
    assert.equal(canAccessRoute("accounts", "/admin/financials"), true);
    assert.equal(canAccessRoute("staff", "/admin/orders"), false);
    assert.equal(canAccessRoute("staff", "/admin/deliveries"), false);
    assert.equal(canAccessRoute("staff", "/admin/financials"), false);
    assert.equal(
      canAccessRoute("hr", "/admin/deliveries/provider/abc/print"),
      true,
    );
    assert.equal(
      canAccessRoute("accounts", "/admin/deliveries/provider/abc/print"),
      false,
    );
    assert.equal(
      canAccessRoute("hr", "/admin/orders/provider/abc/print"),
      true,
    );
  });

  it("allows Accounts to view, export, and finalize financial summaries", () => {
    assert.equal(canViewAllFinancialSummaries("accounts"), true);
    assert.equal(canExportFinancialSummaries("accounts"), true);
    assert.equal(canFinalizeLunchPeriods("accounts"), true);
    assert.equal(canUpdateDailyLunchSubsidy("accounts"), true);
  });

  it("denies HR from export, finalize, and all-staff financial summaries", () => {
    assert.equal(canViewAllFinancialSummaries("hr"), false);
    assert.equal(canExportFinancialSummaries("hr"), false);
    assert.equal(canFinalizeLunchPeriods("hr"), false);
    assert.equal(canUpdateDailyLunchSubsidy("hr"), false);
  });

  it("returns role-specific navigation", () => {
    const staffNav = getNavForRole("staff");
    assert.ok(staffNav.find((g) => g.label === "MAIN")?.items.some((item) => item.href === "/home"));

    const hrNav = getNavForRole("hr");
    assert.ok(hrNav.find((g) => g.label === "HR TOOLS")?.items.some((item) => item.label === "Lunch Providers"));
    assert.ok(hrNav.find((g) => g.label === "HR TOOLS")?.items.some((item) => item.label === "Settings"));
  });
});

describe("getPostLoginPath", () => {
  it("sends all roles to the staff dashboard", () => {
    assert.equal(getPostLoginPath("staff"), "/home");
    assert.equal(getPostLoginPath("hr"), "/home");
    assert.equal(getPostLoginPath("accounts"), "/home");
    assert.equal(getPostLoginPath("admin"), "/home");
    assert.equal(getPostLoginPath("owner"), "/home");
  });
});
