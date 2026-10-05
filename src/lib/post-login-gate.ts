import type { SupabaseClient } from "@supabase/supabase-js";

import { appendSearchParams } from "@/lib/redirect-url";
import { isUserRole, type UserRole } from "@/lib/roles";

export const LOGIN_INACTIVE_MESSAGE =
  "Your account is inactive. Contact HR for assistance.";

export const LOGIN_INCOMPLETE_SETUP_MESSAGE =
  "Your account setup is incomplete. Contact HR for assistance.";

export type PostLoginProfileRow = {
  role: string;
  account_status: string;
};

export type PostLoginDenyReason = "missing_profile" | "inactive" | "invalid_role";

export function getLoginInactivePath(): string {
  return appendSearchParams("/login", { error: "inactive" });
}

export function getLoginIncompleteSetupPath(): string {
  return appendSearchParams("/login", { error: "incomplete-setup" });
}

export function loginPathForPostLoginDeny(reason: PostLoginDenyReason): string {
  switch (reason) {
    case "inactive":
      return getLoginInactivePath();
    case "missing_profile":
    case "invalid_role":
      return getLoginIncompleteSetupPath();
  }
}

export function evaluatePostLoginProfile(
  profile: PostLoginProfileRow | null,
  profileLookupFailed: boolean,
): { ok: true; role: UserRole } | { ok: false; reason: PostLoginDenyReason } {
  if (profileLookupFailed || !profile) {
    return { ok: false, reason: "missing_profile" };
  }

  if (profile.account_status !== "active") {
    return { ok: false, reason: "inactive" };
  }

  if (!isUserRole(profile.role)) {
    return { ok: false, reason: "invalid_role" };
  }

  return { ok: true, role: profile.role };
}

export async function gateApplicationProfileAfterAuth(
  supabase: SupabaseClient,
): Promise<
  | { allowed: true; role: UserRole }
  | { allowed: false; redirectTo: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { allowed: false, redirectTo: "/login" };
  }

  const { data: profileRows, error: profileError } = await supabase.rpc(
    "get_authenticated_profile_for_login",
  );

  const profileRow = Array.isArray(profileRows) ? profileRows[0] : profileRows;
  const profile =
    profileRow &&
    typeof profileRow.role === "string" &&
    typeof profileRow.account_status === "string"
      ? {
          role: profileRow.role,
          account_status: profileRow.account_status,
        }
      : null;

  const evaluation = evaluatePostLoginProfile(profile, Boolean(profileError));

  if (!evaluation.ok) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      allowed: false,
      redirectTo: loginPathForPostLoginDeny(evaluation.reason),
    };
  }

  return { allowed: true, role: evaluation.role };
}
