import {
  canAccessAdminDashboard,
  canManageLegacyLunchDays,
  canManageLunchPeriods,
  canManageProviders,
  canManageOfficeLocations,
  canManageRoles,
  canViewAllFinancialSummaries,
  canViewAllOrders,
  getRoleLabel,
  type UserRole,
} from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  description?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const LUNCH_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", description: "Today's lunch overview" },
  { href: "/lunch", label: "Today's Lunch", description: "Place a new order" },
  { href: "/my-orders", label: "My Orders", description: "View your orders" },
  { href: "/financials", label: "My Financials", description: "Your lunch spending summaries" },
];

const HR_ITEMS: NavItem[] = [
  { href: "/admin/todays-orders", label: "Today's Orders", description: "Today's ordering cycle overview" },
  { href: "/admin/late-orders", label: "Late Orders", description: "HR late-order exceptions" },
  { href: "/admin/deliveries", label: "Deliveries", description: "Today's delivery reconciliation" },
  { href: "/admin/orders", label: "Order History", description: "Historical order lookup" },
  { href: "/admin/providers", label: "Lunch Providers", description: "Recurring menus" },
  { href: "/admin/locations", label: "Office Locations", description: "Delivery locations" },
];

const ACCOUNTS_ITEMS: NavItem[] = [
  { href: "/admin/lunch-periods", label: "Lunch Periods", description: "Payroll lunch periods" },
  { href: "/admin/financials", label: "Financial Summaries", description: "Payroll lunch totals" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", description: "Operations overview" },
  { href: "/admin/users", label: "User Management", description: "Manage employee roles" },
];

export const ACCOUNT_NAV: NavItem = {
  href: "/account",
  label: "Account",
  description: "Profile and settings",
};

export function getNavForRole(role: string): NavGroup[] {
  const groups: NavGroup[] = [];
  const userRole = role as UserRole;

  groups.push({ label: "LUNCH", items: LUNCH_ITEMS });

  const hrItems = HR_ITEMS.filter((item) => canAccessRoute(userRole, item.href));
  if (hrItems.length > 0) {
    groups.push({ label: "HR TOOLS", items: hrItems });
  }

  const accountsItems = ACCOUNTS_ITEMS.filter((item) => canAccessRoute(userRole, item.href));
  if (accountsItems.length > 0) {
    groups.push({ label: "ACCOUNTS", items: accountsItems });
  }

  const adminItems = ADMIN_ITEMS.filter((item) => canAccessRoute(userRole, item.href));
  if (adminItems.length > 0) {
    groups.push({ label: "ADMIN", items: adminItems });
  }

  return groups;
}

export function getPostLoginPath(role: string): string {
  if (canAccessAdminDashboard(role as UserRole)) {
    return "/admin";
  }

  return "/home";
}

export { getRoleLabel };

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/home" || href === "/admin") {
    return pathname === href;
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

  if (pathname === "/admin" || pathname.startsWith("/admin/lunch-days")) {
    return canAccessAdminDashboard(role) || canManageLegacyLunchDays(role);
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
