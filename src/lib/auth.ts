import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessAdminDashboard,
  canFulfillOrders,
  canManageCutoff,
  canManageLegacyLunchDays,
  canManageProviders,
  canManageRoles,
  canViewAllOrders,
  isOwner,
  isUserRole,
  type UserRole,
} from "@/lib/roles";

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
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
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (profileError) {
    return null;
  }

  return profile as Profile;
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

export async function requireHrAdminOrOwner(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageProviders(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireViewAllOrders(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canViewAllOrders(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireFulfillOrders(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canFulfillOrders(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireManageRoles(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageRoles(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireManageCutoff(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageCutoff(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

export async function requireLegacyLunchDays(): Promise<Profile> {
  const profile = await requireProfile();

  if (!canManageLegacyLunchDays(profile.role)) {
    redirectUnauthorized();
  }

  return profile;
}

/** @deprecated Use requireAdminOrOwner() or a capability-specific guard. */
export async function requireAdmin(): Promise<Profile> {
  return requireAdminOrOwner();
}

export {
  canAccessAdminDashboard,
  canFulfillOrders,
  canManageCutoff,
  canManageLegacyLunchDays,
  canManageProviders,
  canManageRoles,
  canViewAllOrders,
  isOwner,
};
