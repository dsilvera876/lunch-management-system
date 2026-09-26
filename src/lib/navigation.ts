import {
  canAccessAdminDashboard,
  canManageLunchPeriods,
  canManageProviders,
  canManageOfficeLocations,
  canManageRoles,
  canViewAllFinancialSummaries,
  canViewAllOrders,
  getRoleLabel,
  type UserRole,
} from "@/lib/roles";
import type { NavIconId } from "@/components/icons/line-icons";

export type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon: NavIconId;
};

export type NavGroup = {
  label: string;
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
];

const ADMIN_ITEMS: NavItem[] = [
  {
    href: "/admin/users",
    label: "User Management",
    description: "Manage employee roles",
    icon: "users",
  },
];

/** Routes reached from HR Tools → Settings (for sidebar active state). */
const HR_SETTINGS_ROUTE_PREFIXES = ["/admin/settings", "/admin/locations"];

export const ACCOUNT_NAV: NavItem = {
  href: "/account",
  label: "Account",
  description: "Profile and settings",
  icon: "sliders",
};

function filterAccessible(role: UserRole, items: NavItem[]): NavItem[] {
  return items.filter((item) => canAccessRoute(role, item.href));
}

export function getNavForRole(role: string): NavGroup[] {
  const groups: NavGroup[] = [];
  const userRole = role as UserRole;

  groups.push({ label: "MAIN", items: MAIN_ITEMS });

  const accountsItems = filterAccessible(userRole, ACCOUNTS_ITEMS);
  if (accountsItems.length > 0) {
    groups.push({ label: "ACCOUNTS", items: accountsItems });
  }

  const hrItems = filterAccessible(userRole, HR_TOOLS_ITEMS);
  if (hrItems.length > 0) {
    groups.push({ label: "HR TOOLS", items: hrItems });
  }

  const adminItems = filterAccessible(userRole, ADMIN_ITEMS);
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

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/home" || href === "/admin") {
    return pathname === href;
  }

  if (href === "/admin/settings") {
    return HR_SETTINGS_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (pathname === "/home" || pathname === "/lunch" || pathname.startsWith("/lunch/")) {
    return true;
  }

  if (pathname === "/my-orders" || pathname === "/account" || pathname === "/financials") {
    return true;
  }

  if (pathname.startsWith("/admin/settings")) {
    return canViewAllOrders(role);
  }

  if (pathname.startsWith("/admin/lunch-days")) {
    return false;
  }

  if (pathname === "/admin") {
    return canAccessAdminDashboard(role);
  }

  if (pathname.startsWith("/admin/providers")) {
    return canManageProviders(role);
  }

  if (pathname.startsWith("/admin/locations")) {
    return canManageOfficeLocations(role);
  }

  if (pathname.startsWith("/admin/lunch-periods")) {
    return canManageLunchPeriods(role);
  }

  if (
    pathname.startsWith("/admin/deliveries") ||
    pathname.startsWith("/admin/orders") ||
    pathname.startsWith("/admin/todays-orders") ||
    pathname.startsWith("/admin/late-orders")
  ) {
    return canViewAllOrders(role);
  }

  if (pathname.startsWith("/admin/financials")) {
    return canViewAllFinancialSummaries(role);
  }

  if (pathname.startsWith("/admin/users")) {
    return canManageRoles(role);
  }

  return false;
}
