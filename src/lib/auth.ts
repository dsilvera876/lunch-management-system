import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessAccountsAdminRoute,
  canAccessAdminDashboard,
  canAccessHrToolsRoute,
  canExportFinancialSummaries,
  canFinalizeLunchPeriods,
  canFulfillOrders,
  canManageCutoff,
  canManageLunchPeriods,
  canManageProviders,
  canManageRoles,
  canManageStaffAccounts,
  canManageEmployeeIds,
  canMutateAccountsOperationalData,
  canMutateHrOperationalData,
  canUpdateDailyLunchSubsidy,
  canViewAllFinancialSummaries,
  canViewAllOrders,
  isOwner,
  isUserRole,
  type UserRole,
} from "@/lib/roles";
import type { SupportScope } from "@/lib/support-mode";
import { fetchActiveSupportSession } from "@/lib/support-mode-server";

export type AccountStatus = "active" | "inactive";

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  account_status: AccountStatus;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, account_status")
    .eq("id", userId)
    .single();

  if (profileError) {
    return null;
  }

  const row = profile as Profile;

  if (row.account_status === "inactive") {
    return null;
  }

  return row;
}

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.role || !isUserRole(profile.role)) {
    return null;
  }

  return profile.role;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}

function redirectUnauthorized() {
  redirect("/account");
}

export async function requireAdminOrOwner(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canAccessAdminDashboard(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireOwner(): Promise<Profile> {
  const profile = await requireProfile();

  if (!isOwner(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

async function activeSupportScopeForProfile(): Promise<SupportScope | null> {
  const session = await fetchActiveSupportSession();
  return session?.scope ?? null;
}

export async function requireHrOperationalRead(): Promise<Profile> {
  const profile = await requireProfile();
  const supportScope = await activeSupportScopeForProfile();

  if (!canAccessHrToolsRoute(profile.role, "/admin/settings", supportScope)) {
    redirectUnauthorized();
  }

  return profile;
}

/** @deprecated Use requireHrOperationalRead for pages; mutations use requireMutateHrOperationalData. */
export async function requireHrAdminOrOwner(): Promise<Profile> {
  return requireHrOperationalRead();
}

export async function requireViewAllOrders(): Promise<Profile> {
  return requireHrOperationalRead();
}

export async function requireAccountsOperationalRead(): Promise<Profile> {
  const profile = await requireProfile();
  const supportScope = await activeSupportScopeForProfile();

  if (!canAccessAccountsAdminRoute(profile.role, "/admin/financials", supportScope)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireMutateHrOperationalData(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canMutateHrOperationalData(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireMutateAccountsOperationalData(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canMutateAccountsOperationalData(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireFulfillOrders(): Promise<Profile> {
  return requireMutateHrOperationalData();
}

export async function requireManageProviders(): Promise<Profile> {
  return requireMutateHrOperationalData();
}

/** Permanent HR only; blocked in Admin/Owner Support Mode (menu item ratings administration). */
export async function requirePermanentHrMenuItemRatingsAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  const supportScope = await activeSupportScopeForProfile();

  if (profile.role !== "hr" || supportScope !== null) {
    redirectUnauthorized();
  }

  return profile;
}

export async function canAccessPermanentHrMenuItemRatingsAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "hr") {
    return false;
  }

  const supportScope = await activeSupportScopeForProfile();
  return supportScope === null;
}

export async function requireManageOfficeLocations(): Promise<Profile> {
  return requireMutateHrOperationalData();
}

export async function requireManageRoles(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageRoles(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireManageStaffAccounts(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageStaffAccounts(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireManageEmployeeIds(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageEmployeeIds(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireManageCutoff(): Promise<Profile> {
  return requireMutateHrOperationalData();
}

export async function requireLunchPeriodsRead(): Promise<Profile> {
  const profile = await requireProfile();
  const supportScope = await activeSupportScopeForProfile();

  if (!canAccessAccountsAdminRoute(profile.role, "/admin/lunch-periods", supportScope)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireManageLunchPeriods(): Promise<Profile> {
  return requireMutateAccountsOperationalData();
}

export async function requireViewAllFinancialSummaries(): Promise<Profile> {
  return requireAccountsOperationalRead();
}

export async function requireExportFinancialSummaries(): Promise<Profile> {
  return requireMutateAccountsOperationalData();
}

export async function requireFinalizeLunchPeriods(): Promise<Profile> {
  return requireMutateAccountsOperationalData();
}

export async function requireUpdateDailyLunchSubsidy(): Promise<Profile> {
  return requireMutateAccountsOperationalData();
}

export async function requireAccountsEmployeeIdDirectoryRead(): Promise<Profile> {
  return requireAccountsOperationalRead();
}

export async function requireMutateEmployeeIds(): Promise<Profile> {
  return requireMutateAccountsOperationalData();
}

/** @deprecated Use requireAdminOrOwner() or a capability-specific guard. */
export async function requireAdmin(): Promise<Profile> {
  return requireAdminOrOwner();
}

export {
  canAccessAdminDashboard,
  canExportFinancialSummaries,
  canFinalizeLunchPeriods,
  canUpdateDailyLunchSubsidy,
  canFulfillOrders,
  canManageCutoff,
  canManageLunchPeriods,
  canManageProviders,
  canManageRoles,
  canManageStaffAccounts,
  canManageEmployeeIds,
  canViewAllFinancialSummaries,
  canViewAllOrders,
  isOwner,
};
