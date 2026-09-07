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

export function canManageProviders(role: UserRole): boolean {
  return role === "hr" || role === "admin" || role === "owner";
}

export function canViewAllOrders(role: UserRole): boolean {
  return role === "hr" || role === "accounts" || role === "admin" || role === "owner";
}

export function canFulfillOrders(role: UserRole): boolean {
  return role === "hr" || role === "admin" || role === "owner";
}

export function canManageCutoff(role: UserRole): boolean {
  return role === "hr" || role === "admin" || role === "owner";
}

export function canManageRoles(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function canManageLegacyLunchDays(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function canManageLunchPeriods(role: UserRole): boolean {
  return role === "hr" || role === "accounts" || role === "admin" || role === "owner";
}

export function canExportLunchPeriodSummaries(role: UserRole): boolean {
  return role === "accounts" || role === "admin" || role === "owner";
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
  return role === "hr" || role === "accounts" || role === "admin" || role === "owner";
}

export function canExportFinancialSummaries(role: UserRole): boolean {
  return role === "accounts" || role === "admin" || role === "owner";
}

export function canFinalizeLunchPeriods(role: UserRole): boolean {
  return role === "accounts" || role === "admin" || role === "owner";
}

export function canUpdateDailyLunchSubsidy(role: UserRole): boolean {
  return role === "accounts" || role === "admin" || role === "owner";
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
