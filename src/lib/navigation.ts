export type NavItem = {
  href: string;
  label: string;
  description?: string;
};

export const STAFF_NAV: NavItem[] = [
  { href: "/home", label: "Home", description: "Today's lunch overview" },
  { href: "/lunch", label: "Order Lunch", description: "Place a new order" },
  { href: "/my-orders", label: "My Orders", description: "View your orders" },
  { href: "/account", label: "Account", description: "Profile and settings" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", description: "Operations overview" },
  {
    href: "/admin/providers",
    label: "Lunch Providers",
    description: "Recurring menus",
  },
  { href: "/admin/orders", label: "Orders", description: "Fulfillment queue" },
  {
    href: "/lunch",
    label: "Lunch / Ordering",
    description: "Staff ordering view",
  },
  { href: "/account", label: "Account", description: "Profile and settings" },
];

export function getNavForRole(role: string): NavItem[] {
  return role === "admin" ? ADMIN_NAV : STAFF_NAV;
}

export function getRoleLabel(role: string): string {
  if (role === "admin") {
    return "Admin";
  }

  return "Staff";
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/home" || href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
