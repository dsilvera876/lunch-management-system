import {
  canAccessAdminDashboard,
  canManageLegacyLunchDays,
  canManageLunchPeriods,
  canManageProviders,
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

const STAFF_ORDERING: NavItem[] = [
  { href: "/home", label: "Home", description: "Today's lunch overview" },
  { href: "/lunch", label: "Order Lunch", description: "Place a new order" },
  { href: "/my-orders", label: "My Orders", description: "View your orders" },
  {
    href: "/financials",
    label: "My Financials",
    description: "Your lunch spending summaries",
  },
];

const ACCOUNT_NAV: NavItem = {
  href: "/account",
  label: "Account",
  description: "Profile and settings",
};

export const STAFF_NAV: NavItem[] = [...STAFF_ORDERING, ACCOUNT_NAV];

const LUNCH_PERIODS_NAV: NavItem = {
  href: "/admin/lunch-periods",
  label: "Lunch Periods",
  description: "Payroll lunch periods",
};

const FINANCIALS_NAV: NavItem = {
  href: "/admin/financials",
  label: "Financial Summaries",
  description: "Payroll lunch totals",
};

export const HR_NAV: NavItem[] = [
  ...STAFF_ORDERING,
  {
    href: "/admin/providers",
    label: "Lunch Providers",
    description: "Recurring menus",
  },
  {
    href: "/admin/locations",
    label: "Office Locations",
    description: "Delivery locations",
  },
  LUNCH_PERIODS_NAV,
  FINANCIALS_NAV,
  { href: "/admin/orders", label: "Orders", description: "Fulfillment queue" },
  ACCOUNT_NAV,
];

export const ACCOUNTS_NAV: NavItem[] = [
  ...STAFF_ORDERING,
  LUNCH_PERIODS_NAV,
  FINANCIALS_NAV,
  { href: "/admin/orders", label: "Orders", description: "All employee orders" },
  ACCOUNT_NAV,
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", description: "Operations overview" },
  {
    href: "/home",
    label: "Staff Home",
    description: "Employee ordering overview",
  },
  {
    href: "/admin/providers",
    label: "Lunch Providers",
    description: "Recurring menus",
  },
  {
    href: "/admin/locations",
    label: "Office Locations",
    description: "Delivery locations",
  },
  LUNCH_PERIODS_NAV,
  FINANCIALS_NAV,
  { href: "/admin/orders", label: "Orders", description: "Fulfillment queue" },
  {
    href: "/lunch",
    label: "Order Lunch",
    description: "Place a staff order",
  },
  {
    href: "/admin/users",
    label: "User / Role Management",
    description: "Manage employee roles",
  },
  ACCOUNT_NAV,
];

export const OWNER_NAV: NavItem[] = ADMIN_NAV;

export function getNavForRole(role: string): NavItem[] {
  switch (role as UserRole) {
    case "hr":
      return HR_NAV;
    case "accounts":
      return ACCOUNTS_NAV;
    case "admin":
    case "owner":
      return ADMIN_NAV;
    case "staff":
    default:
      return STAFF_NAV;
  }
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

  if (pathname.startsWith("/admin/lunch-periods")) {
    return canManageLunchPeriods(role);
  }

  if (pathname.startsWith("/admin/orders")) {
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
