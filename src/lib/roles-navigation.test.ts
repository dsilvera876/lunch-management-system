import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessRoute,
  countActiveNavItems,
  getNavForRole,
  getPostLoginPath,
  isNavItemActive,
  matchesNavPath,
} from "./navigation";
import { readFileSync } from "node:fs";
import {
  canExportFinancialSummaries,
  canFinalizeLunchPeriods,
  canUpdateDailyLunchSubsidy,
  canFulfillOrders,
  canManageLunchPeriods,
  canManageProviders,
  canManageOfficeLocations,
  canManageRoles,
  canManageStaffAccounts,
  canManageEmployeeIds,
  canViewAllFinancialSummaries,
  canViewAllOrders,
  canViewAccountsOperationalData,
  canViewHrOperationalData,
  ADMIN_USER_MANAGEMENT_HREF,
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

  it("allows Admin and Owner governance only without permanent HR/Accounts caps", () => {
    assert.equal(canManageRoles("admin"), true);
    assert.equal(canManageRoles("owner"), true);
    assert.equal(canViewAllOrders("admin"), false);
    assert.equal(canViewAllFinancialSummaries("admin"), false);
    assert.equal(canManageProviders("admin"), false);
    assert.equal(canManageLunchPeriods("admin"), false);
    assert.equal(canViewHrOperationalData("admin", "hr"), true);
    assert.equal(canViewAccountsOperationalData("admin", "accounts"), true);
  });
});

function primaryNavItems(role: string) {
  return getNavForRole(role).find((group) => group.label === null)?.items ?? [];
}

function sectionLabels(role: string) {
  return getNavForRole(role)
    .map((group) => group.label)
    .filter((label): label is string => label !== null);
}

describe("navigation by role", () => {
  it("includes Dashboard for staff without management groups", () => {
    const nav = getNavForRole("staff");
    assert.ok(primaryNavItems("staff").some((item) => item.href === "/home"));
    assert.equal(nav[0]?.label, null);
    const todaysOrder = primaryNavItems("staff").find((item) => item.href === "/lunch");
    assert.equal(todaysOrder?.icon, "utensils");
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
  });

  it("shows Users for HR but not Admin user management group", () => {
    const nav = getNavForRole("hr");
    const hrTools = nav.find((g) => g.label === "HR TOOLS");
    assert.ok(hrTools?.items.some((item) => item.href === "/admin/users"));
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
    assert.equal(canAccessRoute("hr", "/admin/users"), true);
    assert.equal(canAccessRoute("admin", "/admin/users"), true);
    assert.equal(canAccessRoute("staff", "/admin/users"), false);
  });

  it("shows Employee IDs for Accounts only", () => {
    const accountsNav = getNavForRole("accounts");
    assert.ok(
      accountsNav
        .find((g) => g.label === "ACCOUNTS")
        ?.items.some((item) => item.href === "/admin/employee-ids"),
    );
    assert.equal(canAccessRoute("accounts", "/admin/employee-ids"), true);
    assert.equal(canAccessRoute("hr", "/admin/employee-ids"), false);
    assert.equal(canAccessRoute("admin", "/admin/employee-ids"), false);
    assert.equal(canManageEmployeeIds("accounts"), true);
    assert.equal(canManageStaffAccounts("hr"), true);
    assert.equal(canManageStaffAccounts("accounts"), false);
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
    assert.ok(primaryNavItems("hr").some((item) => item.href === "/financials"));
    assert.ok(!nav.find((g) => g.label === "ACCOUNTS"));
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
  });

  it("shows Accounts group for Accounts", () => {
    const nav = getNavForRole("accounts");
    const accounts = nav.find((g) => g.label === "ACCOUNTS");
    assert.ok(accounts?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(accounts?.items.some((item) => item.href === "/admin/financials"));
    assert.ok(!nav.find((g) => g.label === "ADMIN"));
    assert.ok(primaryNavItems("accounts").some((item) => item.href === "/my-orders"));
  });

  it("shows ADMIN only for Admin and Owner in the sidebar", () => {
    for (const role of ["admin", "owner"] as const) {
      assert.deepEqual(sectionLabels(role), ["ADMIN"]);
      assert.ok(!getNavForRole(role).some((group) => group.label === "HR TOOLS"));
      assert.ok(!getNavForRole(role).some((group) => group.label === "ACCOUNTS"));
    }
  });

  it("does not render a MAIN section label", () => {
    for (const role of ["staff", "hr", "accounts", "admin", "owner"] as const) {
      const nav = getNavForRole(role);
      assert.ok(!nav.some((group) => group.label === "MAIN"));
      assert.ok(primaryNavItems(role).some((item) => item.href === "/home"));
    }

    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );
    assert.match(shell, /group\.label \?/);
    assert.doesNotMatch(shell, /MAIN/);
  });

  it("orders visible sections as HR TOOLS then ACCOUNTS then ADMIN when multiple apply", () => {
    assert.deepEqual(sectionLabels("hr"), ["HR TOOLS"]);
    assert.deepEqual(sectionLabels("accounts"), ["ACCOUNTS"]);
    assert.deepEqual(sectionLabels("admin"), ["ADMIN"]);
    assert.deepEqual(sectionLabels("owner"), ["ADMIN"]);
  });

  it("shows Lunch Periods in ACCOUNTS nav for Accounts only", () => {
    const hrNav = getNavForRole("hr");
    const accountsNav = getNavForRole("accounts");
    const adminNav = getNavForRole("admin");
    const ownerNav = getNavForRole("owner");
    const staffNav = getNavForRole("staff");

    assert.ok(!hrNav.flatMap((group) => group.items).some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(accountsNav.find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(!adminNav.flatMap((group) => group.items).some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(!ownerNav.flatMap((group) => group.items).some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(!staffNav.find((g) => g.label === "ADMIN"));
    assert.equal(canAccessRoute("admin", "/admin/lunch-periods"), false);
    assert.equal(canAccessRoute("owner", "/admin/lunch-periods"), false);
  });

  it("does not duplicate Lunch Periods across navigation groups", () => {
    const matches = getNavForRole("accounts")
      .flatMap((group) => group.items)
      .filter((item) => item.href === "/admin/lunch-periods");

    assert.equal(matches.length, 1);
  });

  it("restricts lunch-period HTTP routes to Accounts only", () => {
    assert.equal(canManageLunchPeriods("hr"), false);
    assert.equal(canManageLunchPeriods("staff"), false);
    assert.equal(canManageLunchPeriods("accounts"), true);
    assert.equal(canManageLunchPeriods("admin"), false);
    assert.equal(canManageLunchPeriods("owner"), false);
    assert.equal(canAccessRoute("hr", "/admin/lunch-periods"), false);
    assert.equal(canAccessRoute("staff", "/admin/lunch-periods"), false);
    assert.equal(canAccessRoute("accounts", "/admin/lunch-periods"), true);
    assert.equal(canAccessRoute("admin", "/admin/lunch-periods"), false);
    assert.equal(canAccessRoute("owner", "/admin/lunch-periods"), false);
  });

  it("includes user management and admin settings under ADMIN for Admin and Owner", () => {
    for (const role of ["admin", "owner"] as const) {
      const nav = getNavForRole(role);
      const adminGroup = nav.find((g) => g.label === "ADMIN");
      assert.ok(adminGroup?.items.some((item) => item.href === ADMIN_USER_MANAGEMENT_HREF));
      assert.ok(adminGroup?.items.some((item) => item.href === "/admin/settings/system"));
      assert.equal(adminGroup?.items.length, 3);
      assert.ok(adminGroup?.items.some((item) => item.href === "/admin/support"));
    }
  });

  it("does not show Admin Settings for HR, Accounts, or Staff", () => {
    for (const role of ["hr", "accounts", "staff"] as const) {
      const nav = getNavForRole(role);
      const navText = JSON.stringify(nav);
      assert.doesNotMatch(navText, /\/admin\/settings\/system/);
      assert.equal(canAccessRoute(role, "/admin/settings/system"), false);
    }
  });

  it("includes financial summaries for Accounts but not HR or staff admin routes", () => {
    const hrNav = getNavForRole("hr");
    const accountsNav = getNavForRole("accounts");
    const staffNav = getNavForRole("staff");

    assert.ok(!hrNav.flatMap((group) => group.items).some((item) => item.href === "/admin/financials"));
    assert.ok(accountsNav.find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/financials"));
    assert.ok(primaryNavItems("staff").some((item) => item.href === "/financials"));
    assert.equal(
      staffNav.flatMap((group) => group.items).filter((item) => item.href === "/financials").length,
      1,
    );
  });

  it("allows HR settings hub for HR but not staff, accounts, or governance roles", () => {
    assert.equal(canAccessRoute("hr", "/admin/settings"), true);
    assert.equal(canAccessRoute("admin", "/admin/settings"), false);
    assert.equal(canAccessRoute("owner", "/admin/settings"), false);
    assert.equal(canAccessRoute("staff", "/admin/settings"), false);
    assert.equal(canAccessRoute("accounts", "/admin/settings"), false);
    assert.equal(canAccessRoute("hr", "/admin/locations"), true);
    assert.equal(canAccessRoute("admin", "/admin/locations"), false);
  });

  it("restricts HR workflow routes to HR only", () => {
    for (const path of ["/admin/todays-orders", "/admin/late-orders", "/admin/deliveries"]) {
      assert.equal(canAccessRoute("hr", path), true);
      assert.equal(canAccessRoute("admin", path), false);
      assert.equal(canAccessRoute("owner", path), false);
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
    assert.ok(primaryNavItems("staff").some((item) => item.href === "/home"));

    const hrNav = getNavForRole("hr");
    assert.ok(hrNav.find((g) => g.label === "HR TOOLS")?.items.some((item) => item.label === "Lunch Providers"));
    assert.ok(hrNav.find((g) => g.label === "HR TOOLS")?.items.some((item) => item.label === "Settings"));
  });
});

describe("route access boundaries", () => {
  it("denies Admin and Owner HR-only and Accounts-only URLs", () => {
    for (const role of ["admin", "owner"] as const) {
      assert.equal(canAccessRoute(role, "/admin/users/import"), false);
      assert.equal(canAccessRoute(role, "/admin/financials"), false);
      assert.equal(canAccessRoute(role, "/admin/financials/export"), false);
      assert.equal(canAccessRoute(role, "/admin/lunch-periods"), false);
      assert.equal(canAccessRoute(role, "/admin/employee-ids"), false);
      assert.equal(canAccessRoute(role, "/admin/providers"), false);
      assert.equal(canAccessRoute(role, "/admin/orders"), false);
      assert.equal(canAccessRoute(role, "/admin/settings"), false);
    }
  });

  it("allows HR operational routes and user workspace", () => {
    assert.equal(canAccessRoute("hr", "/admin/users"), true);
    assert.equal(canAccessRoute("hr", "/admin/users/import"), true);
    assert.equal(canAccessRoute("hr", "/admin/providers"), true);
    assert.equal(canAccessRoute("hr", "/admin/orders"), true);
    assert.equal(canAccessRoute("hr", "/admin/financials"), false);
    assert.equal(canAccessRoute("hr", "/admin/settings/system"), false);
  });

  it("allows Accounts payroll routes only for Accounts", () => {
    assert.equal(canAccessRoute("accounts", "/admin/financials"), true);
    assert.equal(canAccessRoute("accounts", "/admin/lunch-periods"), true);
    assert.equal(canAccessRoute("accounts", "/admin/employee-ids"), true);
    assert.equal(canAccessRoute("accounts", "/admin/users"), false);
    assert.equal(canAccessRoute("accounts", "/admin/settings/system"), false);
    assert.equal(canAccessRoute("accounts", "/admin/deliveries"), false);
  });

  it("allows Admin and Owner governance routes", () => {
    for (const role of ["admin", "owner"] as const) {
      assert.equal(canAccessRoute(role, "/admin/users"), true);
      assert.equal(canAccessRoute(role, "/admin/settings/system"), true);
      assert.equal(canAccessRoute(role, "/admin/settings/authentication"), true);
      assert.equal(canAccessRoute(role, "/admin/settings/email-delivery"), true);
    }
  });
});

describe("sidebar active state", () => {
  const usersPath = "/admin/users";

  function findNavItem(
    role: string,
    groupLabel: string,
    itemLabel: string,
    supportScope: "hr" | "accounts" | null = null,
  ) {
    const group = getNavForRole(role, supportScope).find((entry) => entry.label === groupLabel);
    return group?.items.find((item) => item.label === itemLabel) ?? null;
  }

  it("highlights HR Users only for HR on /admin/users", () => {
    const nav = getNavForRole("hr");
    const hrUsers = findNavItem("hr", "HR TOOLS", "Users");
    assert.ok(hrUsers);
    assert.equal(
      isNavItemActive(usersPath, hrUsers, "hr", "HR TOOLS", null, null),
      true,
    );
    assert.equal(countActiveNavItems(usersPath, "hr", nav, null, null), 1);
  });

  it("highlights User Management only for Admin and Owner on governance context", () => {
    for (const role of ["admin", "owner"] as const) {
      const nav = getNavForRole(role);
      assert.equal(findNavItem(role, "HR TOOLS", "Users"), null);
      const userManagement = findNavItem(role, "ADMIN", "User Management");
      assert.ok(userManagement);
      assert.equal(
        isNavItemActive(usersPath, userManagement, role, "ADMIN", "governance", null),
        true,
      );
      assert.equal(
        isNavItemActive(usersPath, userManagement, role, "ADMIN", null, null),
        false,
      );
      assert.equal(countActiveNavItems(usersPath, role, nav, "governance", null), 1);
    }
  });

  it("highlights HR Users for Admin in HR support without governance context", () => {
    const hrUsers = findNavItem("admin", "HR TOOLS", "Users", "hr");
    assert.ok(hrUsers);
    assert.equal(
      isNavItemActive(usersPath, hrUsers, "admin", "HR TOOLS", null, "hr"),
      true,
    );
    const userManagement = findNavItem("admin", "ADMIN", "User Management", "hr");
    assert.ok(userManagement);
    assert.equal(
      isNavItemActive(usersPath, userManagement, "admin", "ADMIN", null, "hr"),
      false,
    );
  });

  it("keeps unrelated route highlighting unchanged", () => {
    const dashboard = primaryNavItems("staff").find((item) => item.href === "/home");
    const lunch = primaryNavItems("staff").find((item) => item.href === "/lunch");
    assert.ok(dashboard);
    assert.ok(lunch);
    assert.equal(isNavItemActive("/home", dashboard, "staff", null), true);
    assert.equal(isNavItemActive("/lunch", lunch, "staff", null), true);
    assert.equal(isNavItemActive("/home", lunch, "staff", null), false);
    assert.ok(matchesNavPath("/admin/users/import", usersPath));
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
