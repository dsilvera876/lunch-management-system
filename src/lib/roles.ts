export const USER_ROLES = [
  "staff",
  "hr",
  "accounts",
  "admin",
  "owner",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ASSIGNABLE_ROLES = [
  "staff",
  "hr",
  "accounts",
  "admin",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isUserRole(role: string): role is UserRole {
  return (USER_ROLES as readonly string[]).includes(role);
}

export function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/** Permanent HR business role only (not Admin/Owner support read). */
export function canManageProviders(role: UserRole): boolean {
  return role === "hr";
}

export function canManageOfficeLocations(role: UserRole): boolean {
  return role === "hr";
}

export function canViewAllOrders(role: UserRole): boolean {
  return role === "hr";
}

export function canFulfillOrders(role: UserRole): boolean {
  return role === "hr";
}

export function canManageCutoff(role: UserRole): boolean {
  return role === "hr";
}

export function canManageRoles(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function canManageAuthSettings(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function canManageStaffAccounts(role: UserRole): boolean {
  return role === "hr";
}

export function canManageEmployeeIds(role: UserRole): boolean {
  return role === "hr" || role === "accounts";
}

export function canManageLunchPeriods(role: UserRole): boolean {
  return role === "accounts";
}

export function canExportLunchPeriodSummaries(role: UserRole): boolean {
  return role === "accounts";
}

export function canViewFinancialSummaries(role: UserRole): boolean {
  return (
    role === "hr" ||
    role === "accounts" ||
    role === "admin" ||
    role === "owner" ||
    role === "staff"
  );
}

export function canViewAllFinancialSummaries(role: UserRole): boolean {
  return role === "accounts";
}

export function canExportFinancialSummaries(role: UserRole): boolean {
  return role === "accounts";
}

export function canFinalizeLunchPeriods(role: UserRole): boolean {
  return role === "accounts";
}

export function canUpdateDailyLunchSubsidy(role: UserRole): boolean {
  return role === "accounts";
}

export function canAccessAdminDashboard(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function isOwner(role: UserRole): boolean {
  return role === "owner";
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case "staff":
      return "Staff";
    case "hr":
      return "HR";
    case "accounts":
      return "Accounts";
    case "admin":
      return "Admin";
    case "owner":
      return "Owner";
    default:
      return role;
  }
}

import type { SupportScope } from "@/lib/support-mode";

export function canViewHrOperationalData(
  role: UserRole,
  supportScope: SupportScope | null = null,
): boolean {
  if (role === "hr") {
    return true;
  }
  return canManageRoles(role) && supportScope === "hr";
}

export function canViewAccountsOperationalData(
  role: UserRole,
  supportScope: SupportScope | null = null,
): boolean {
  if (role === "accounts") {
    return true;
  }
  return canManageRoles(role) && supportScope === "accounts";
}

/** HR TOOLS sidebar and HTTP routes (operational HR; not Admin/Owner governance). */
export function canAccessHrToolsRoute(
  role: UserRole,
  href: string,
  supportScope: SupportScope | null = null,
): boolean {
  if (!canViewHrOperationalData(role, supportScope)) {
    return false;
  }

  if (href === "/admin/users") {
    return true;
  }

  if (
    href === "/admin/providers" ||
    href === "/admin/settings" ||
    href === "/admin/todays-orders" ||
    href === "/admin/late-orders" ||
    href === "/admin/deliveries" ||
    href === "/admin/orders"
  ) {
    return true;
  }

  return false;
}

/** ACCOUNTS sidebar and HTTP routes (payroll; excludes Admin/Owner without support). */
export function canAccessAccountsAdminRoute(
  role: UserRole,
  href: string,
  supportScope: SupportScope | null = null,
): boolean {
  if (!canViewAccountsOperationalData(role, supportScope)) {
    return false;
  }

  if (href === "/admin/lunch-periods" || href === "/admin/financials") {
    return true;
  }

  if (href === "/admin/employee-ids") {
    return !canManageStaffAccounts(role);
  }

  return false;
}

/** ADMIN sidebar and governance HTTP routes. */
export const ADMIN_USER_MANAGEMENT_HREF = "/admin/users?context=governance";

export function canAccessAdminGovernanceRoute(role: UserRole, href: string): boolean {
  if (href === ADMIN_USER_MANAGEMENT_HREF || href === "/admin/users") {
    return canManageRoles(role);
  }

  if (href === "/admin/settings/system") {
    return canManageAuthSettings(role);
  }

  return false;
}

export function canAccessHrOfficeLocationsRoute(
  role: UserRole,
  supportScope: SupportScope | null = null,
): boolean {
  return canViewHrOperationalData(role, supportScope);
}

export function canMutateHrOperationalData(role: UserRole): boolean {
  return role === "hr";
}

export function canMutateAccountsOperationalData(role: UserRole): boolean {
  return role === "accounts";
}
