import {
  ADMIN_USER_MANAGEMENT_HREF,
  canAccessAccountsAdminRoute,
  canAccessAdminDashboard,
  canAccessAdminGovernanceRoute,
  canAccessHrOfficeLocationsRoute,
  canAccessHrToolsRoute,
  canManageAuthSettings,
  canManageRoles,
  canManageStaffAccounts,
  getRoleLabel,
  type UserRole,
} from "@/lib/roles";
import type { SupportScope } from "@/lib/support-mode";
import type { NavIconId } from "@/components/icons/line-icons";

export type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon: NavIconId;
};

export type NavGroup = {
  /** `null` = primary staff navigation (no visible section heading). */
  label: string | null;
  items: NavItem[];
};

const MAIN_ITEMS: NavItem[] = [
  { href: "/home", label: "Dashboard", description: "Your lunch overview", icon: "dashboard" },
  { href: "/lunch", label: "Today's Order", description: "Place a new order", icon: "utensils" },
  { href: "/my-orders", label: "My Orders", description: "View your orders", icon: "receipt" },
  { href: "/financials", label: "My Spend", description: "Your lunch spending summaries", icon: "wallet" },
  { href: "/account", label: "Preferences", description: "Profile and delivery settings", icon: "sliders" },
];

const ACCOUNTS_ITEMS: NavItem[] = [
  {
    href: "/admin/lunch-periods",
    label: "Lunch Periods",
    description: "Payroll lunch periods",
    icon: "calendar",
  },
  {
    href: "/admin/financials",
    label: "Financial Reports",
    description: "Payroll lunch totals",
    icon: "chart",
  },
  {
    href: "/admin/employee-ids",
    label: "Employee IDs",
    description: "Assign payroll Employee IDs",
    icon: "users",
  },
];

const HR_TOOLS_ITEMS: NavItem[] = [
  {
    href: "/admin/todays-orders",
    label: "Today's Orders",
    description: "Today's ordering cycle overview",
    icon: "utensils",
  },
  {
    href: "/admin/late-orders",
    label: "Late Orders",
    description: "HR late-order exceptions",
    icon: "clock",
  },
  {
    href: "/admin/deliveries",
    label: "Deliveries",
    description: "Today's delivery reconciliation",
    icon: "truck",
  },
  {
    href: "/admin/orders",
    label: "Order History",
    description: "Historical order lookup",
    icon: "history",
  },
  {
    href: "/admin/providers",
    label: "Lunch Providers",
    description: "Recurring menus",
    icon: "storefront",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "Office locations, cutoff, and lunch program configuration",
    icon: "settings",
  },
  {
    href: "/admin/users",
    label: "Users",
    description: "Staff records and Employee IDs",
    icon: "users",
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    href: "/admin/support",
    label: "Support Mode",
    description: "Temporary read-only HR or Accounts troubleshooting access",
    icon: "clipboard",
  },
  {
    href: ADMIN_USER_MANAGEMENT_HREF,
    label: "User Management",
    description: "Manage employee roles",
    icon: "users",
  },
  {
    href: "/admin/settings/system",
    label: "Admin Settings",
    description: "Authentication, email delivery, and system configuration",
    icon: "settings",
  },
];

const ADMIN_SYSTEM_SETTINGS_PREFIXES = [
  "/admin/settings/system",
  "/admin/settings/authentication",
  "/admin/settings/email-delivery",
];

export const ACCOUNT_NAV: NavItem = {
  href: "/account",
  label: "Account",
  description: "Profile and settings",
  icon: "sliders",
};

export const canShowHrToolsNavItem = canAccessHrToolsRoute;
export const canShowAccountsNavItem = canAccessAccountsAdminRoute;
export const canShowAdminNavItem = canAccessAdminGovernanceRoute;

function hrToolsRouteKeyForPathname(pathname: string): string | null {
  if (pathname.startsWith("/admin/todays-orders")) {
    return "/admin/todays-orders";
  }
  if (pathname.startsWith("/admin/late-orders")) {
    return "/admin/late-orders";
  }
  if (pathname.startsWith("/admin/deliveries")) {
    return "/admin/deliveries";
  }
  if (pathname.startsWith("/admin/orders")) {
    return "/admin/orders";
  }
  if (pathname.startsWith("/admin/providers")) {
    return "/admin/providers";
  }
  if (pathname.startsWith("/admin/settings/business-calendar")) {
    return "/admin/settings/business-calendar";
  }

  if (pathname === "/admin/settings") {
    return "/admin/settings";
  }
  return null;
}

function filterNavItems(
  role: UserRole,
  items: NavItem[],
  canShow: (role: UserRole, href: string, supportScope: SupportScope | null) => boolean,
  supportScope: SupportScope | null,
): NavItem[] {
  return items.filter(
    (item) =>
      canAccessRoute(role, item.href, supportScope) &&
      canShow(role, item.href, supportScope),
  );
}

function canShowAdminNavItemWithSupport(
  role: UserRole,
  href: string,
): boolean {
  if (href === "/admin/support") {
    return canManageRoles(role);
  }
  return canShowAdminNavItem(role, href);
}

export function getNavForRole(
  role: string,
  supportScope: SupportScope | null = null,
): NavGroup[] {
  const groups: NavGroup[] = [];
  const userRole = role as UserRole;

  groups.push({ label: null, items: MAIN_ITEMS });

  const hrItems = filterNavItems(
    userRole,
    HR_TOOLS_ITEMS,
    (r, href) => canShowHrToolsNavItem(r, href, supportScope),
    supportScope,
  );
  if (hrItems.length > 0) {
    groups.push({ label: "HR TOOLS", items: hrItems });
  }

  const accountsItems = filterNavItems(
    userRole,
    ACCOUNTS_ITEMS,
    (r, href) => canShowAccountsNavItem(r, href, supportScope),
    supportScope,
  );
  if (accountsItems.length > 0) {
    groups.push({ label: "ACCOUNTS", items: accountsItems });
  }

  const adminItems = filterNavItems(
    userRole,
    ADMIN_ITEMS,
    (r, href) => canShowAdminNavItemWithSupport(r, href),
    supportScope,
  );
  if (adminItems.length > 0) {
    groups.push({ label: "ADMIN", items: adminItems });
  }

  return groups;
}

export function getPostLoginPath(_role?: string): string {
  void _role;
  return "/home";
}

export { getRoleLabel };

export function matchesNavPath(pathname: string, href: string): boolean {
  if (href === "/home" || href === "/admin") {
    return pathname === href;
  }

  if (href === "/admin/settings/system") {
    return ADMIN_SYSTEM_SETTINGS_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }

  if (href === "/admin/settings") {
    return (
      pathname === "/admin/settings" ||
      pathname.startsWith("/admin/locations") ||
      pathname.startsWith("/admin/settings/business-calendar")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** @deprecated Prefer {@link isNavItemActive} for sidebar items that share a href. */
export function isNavActive(pathname: string, href: string): boolean {
  return matchesNavPath(pathname, href);
}

export function isNavItemActive(
  pathname: string,
  item: NavItem,
  role: UserRole,
  groupLabel: string | null,
  usersContext: string | null = null,
  supportScope: SupportScope | null = null,
): boolean {
  if (pathname.startsWith("/admin/users")) {
    if (item.href === ADMIN_USER_MANAGEMENT_HREF) {
      return groupLabel === "ADMIN" && usersContext === "governance";
    }
    if (item.href === "/admin/users" && item.label === "Users") {
      return (
        groupLabel === "HR TOOLS" &&
        usersContext !== "governance" &&
        (canManageStaffAccounts(role) ||
          (canManageRoles(role) && supportScope === "hr"))
      );
    }
    return false;
  }

  if (!matchesNavPath(pathname, item.href)) {
    return false;
  }

  return true;
}

export function countActiveNavItems(
  pathname: string,
  role: UserRole,
  groups: NavGroup[],
  usersContext: string | null = null,
  supportScope: SupportScope | null = null,
): number {
  let count = 0;
  for (const group of groups) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item, role, group.label, usersContext, supportScope)) {
        count += 1;
      }
    }
  }
  return count;
}

export function canAccessRoute(
  role: UserRole,
  pathname: string,
  supportScope: SupportScope | null = null,
): boolean {
  if (pathname === "/home" || pathname === "/lunch" || pathname.startsWith("/lunch/")) {
    return true;
  }

  if (pathname === "/my-orders" || pathname === "/account" || pathname === "/financials") {
    return true;
  }

  if (pathname.startsWith("/admin/lunch-days")) {
    return false;
  }

  if (
    pathname.startsWith("/admin/settings/system") ||
    pathname.startsWith("/admin/settings/email-delivery") ||
    pathname.startsWith("/admin/settings/authentication")
  ) {
    return canManageAuthSettings(role);
  }

  if (pathname.startsWith("/admin/support")) {
    return canManageRoles(role);
  }

  if (pathname.startsWith("/admin/users/import")) {
    return canManageStaffAccounts(role);
  }

  if (pathname.startsWith("/admin/users")) {
    return (
      canManageRoles(role) ||
      canManageStaffAccounts(role) ||
      (canManageRoles(role) && supportScope === "hr")
    );
  }

  if (pathname === "/admin") {
    return canAccessAdminDashboard(role);
  }

  if (pathname.startsWith("/admin/lunch-periods")) {
    return canAccessAccountsAdminRoute(role, "/admin/lunch-periods", supportScope);
  }

  if (pathname.startsWith("/admin/financials")) {
    return canAccessAccountsAdminRoute(role, "/admin/financials", supportScope);
  }

  if (pathname.startsWith("/admin/employee-ids")) {
    return canAccessAccountsAdminRoute(role, "/admin/employee-ids", supportScope);
  }

  if (pathname.startsWith("/admin/locations")) {
    return canAccessHrOfficeLocationsRoute(role, supportScope);
  }

  const hrRouteKey = hrToolsRouteKeyForPathname(pathname);
  if (hrRouteKey) {
    return canAccessHrToolsRoute(role, hrRouteKey, supportScope);
  }

  return false;
}
