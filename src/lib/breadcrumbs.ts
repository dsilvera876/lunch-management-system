export type BreadcrumbItem = {
  label: string;
  href?: string;
};

const LABELS: Record<string, string> = {
  home: "Dashboard",
  lunch: "Today's Order",
  "my-orders": "My Orders",
  financials: "My Spend",
  account: "Preferences",
  admin: "Administration",
  providers: "Lunch Providers",
  locations: "Office Locations",
  users: "Users & Teams",
  "lunch-periods": "Lunch Periods",
  "lunch-days": "Lunch Days",
  "late-orders": "Late Orders",
  deliveries: "Deliveries",
  orders: "Order History",
  "todays-orders": "Today's Orders",
  settings: "Settings",
};

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/home" }];

  if (pathname === "/home") {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "admin") {
    crumbs.push({ label: "Administration", href: "/admin" });
    const section = segments[1];

    if (!section) {
      crumbs[crumbs.length - 1] = { label: "Dashboard" };
      return crumbs;
    }

    const sectionLabel = LABELS[section] ?? section.replace(/-/g, " ");
    crumbs.push({
      label: sectionLabel,
      href: segments.length === 2 ? undefined : `/admin/${section}`,
    });

    if (segments.length > 2 && segments[2] !== "print") {
      crumbs.push({ label: "Details" });
    }

    return crumbs;
  }

  const root = segments[0] ?? "";
  crumbs.push({
    label: LABELS[root] ?? root.replace(/-/g, " "),
  });

  return crumbs;
}
