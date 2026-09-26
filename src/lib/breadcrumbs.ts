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
  users: "User Management",
  "lunch-periods": "Lunch Periods",
  "late-orders": "Late Orders",
  deliveries: "Deliveries",
  orders: "Order History",
  "todays-orders": "Today's Orders",
  settings: "Settings",
};

function adminSectionLabel(section: string): string {
  if (section === "financials") {
    return "Financial Reports";
  }

  return LABELS[section] ?? section.replace(/-/g, " ");
}

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/home" }];

  if (pathname === "/home") {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "admin") {
    const section = segments[1];

    if (!section) {
      crumbs.push({ label: "Administration" });
      return crumbs;
    }

    if (section === "settings") {
      crumbs.push({ label: "Settings" });
      return crumbs;
    }

    if (section === "locations") {
      crumbs.push({ label: "Settings", href: "/admin/settings" });
      crumbs.push({ label: "Office Locations" });
      return crumbs;
    }

    if (section === "providers") {
      crumbs.push({ label: "Lunch Providers", href: "/admin/providers" });

      if (segments.length === 2) {
        crumbs[crumbs.length - 1] = { label: "Lunch Providers" };
        return crumbs;
      }

      if (segments[2] === "edit") {
        crumbs.push({ label: "Edit provider" });
        return crumbs;
      }

      if (segments.length > 2 && segments[2] !== "print") {
        crumbs.push({ label: "Manage menu" });
      }

      return crumbs;
    }

    const sectionLabel = adminSectionLabel(section);

    crumbs.push({ label: "Administration" });
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
