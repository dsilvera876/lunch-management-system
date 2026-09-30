export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbOptions = {
  /** Authenticated profile role; HR users omit Administration on Users paths. */
  role?: string;
};

function isHrUsersContext(role: string | undefined): boolean {
  return role === "hr";
}

const LABELS: Record<string, string> = {
  home: "Dashboard",
  lunch: "Today's Order",
  "my-orders": "My Orders",
  financials: "My Spend",
  account: "Preferences",
  admin: "Administration",
  providers: "Lunch Providers",
  locations: "Office Locations",
  users: "Users",
  "employee-ids": "Employee IDs",
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

export function getBreadcrumbs(pathname: string, options: BreadcrumbOptions = {}): BreadcrumbItem[] {
  const { role } = options;
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
      const subSection = segments[2];

      if (subSection === "system") {
        crumbs.push({ label: "Admin Settings" });
        return crumbs;
      }

      if (subSection === "authentication") {
        crumbs.push({ label: "Admin Settings", href: "/admin/settings/system" });
        crumbs.push({ label: "Authentication" });
        return crumbs;
      }

      if (subSection === "email-delivery") {
        crumbs.push({ label: "Admin Settings", href: "/admin/settings/system" });
        crumbs.push({ label: "Email Delivery" });
        return crumbs;
      }

      if (subSection === "business-calendar") {
        crumbs.push({ label: "Settings", href: "/admin/settings" });
        crumbs.push({ label: "Business Calendar" });
        return crumbs;
      }

      crumbs.push({ label: "Settings" });
      return crumbs;
    }

    if (section === "locations") {
      crumbs.push({ label: "Settings", href: "/admin/settings" });
      crumbs.push({ label: "Office Locations" });
      return crumbs;
    }

    if (section === "users") {
      if (segments[2] === "import") {
        crumbs.push({ label: "Users", href: "/admin/users" });
        crumbs.push({ label: "Bulk Import" });
        return crumbs;
      }

      if (isHrUsersContext(role)) {
        crumbs.push({ label: "Users" });
        return crumbs;
      }

      crumbs.push({ label: "Administration" });
      crumbs.push({ label: "Users" });
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
