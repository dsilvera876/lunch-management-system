"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isRoleMutationBlockedBySupportMode,
  requireManageRoles,
  requireOwner,
} from "@/lib/auth";
import { isAssignableRole } from "@/lib/roles";
import {
  classifyManageableUserUpdateError,
  classifyOwnershipTransferError,
  isSupportModeMutationErrorMessage,
  manageableUserRequestedRole,
  manageableUserRoleChanges,
  type ManageableUserUpdateError,
  type OwnershipTransferError,
} from "@/lib/role-mutation-errors";
import { createClient } from "@/lib/supabase/server";
import type { ManageableUserRecord } from "@/lib/user-management-presentation";
import {
  emailsMatchForDeletionConfirmation,
  type UserDeletionEligibility,
  type UserDeletionReasonCategory,
} from "@/lib/user-deletion";
import {
  fetchUserDeletionEligibility,
  permanentlyDeleteUserAccountOrchestrated,
} from "@/lib/permanent-user-deletion";

export type UpdateManageableUserInlineResult =
  | { success: true; user: ManageableUserRecord }
  | { success: false; error: ManageableUserUpdateError };

export type TransferOwnershipInlineResult =
  | {
      success: true;
      previousOwnerId: string;
      newOwnerId: string;
      viewerBecameAdmin: boolean;
    }
  | { success: false; error: OwnershipTransferError };

async function loadManageableUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<ManageableUserRecord | null> {
  const { data, error } = await supabase.rpc("list_manageable_users");

  if (error || !data) {
    return null;
  }

  const row = (data as ManageableUserRecord[]).find((user) => user.id === profileId);
  return row ?? null;
}

export async function updateManageableUserInline(input: {
  profileId: string;
  fullName: string;
  role: string;
}): Promise<UpdateManageableUserInlineResult> {
  const actor = await requireManageRoles();

  const { profileId, fullName, role } = input;

  if (typeof profileId !== "string" || profileId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();

  const { data: existingRows, error: listError } = await supabase.rpc(
    "list_manageable_users",
  );

  if (listError || !existingRows) {
    return { success: false, error: "invalid" };
  }

  const existing = (existingRows as ManageableUserRecord[]).find(
    (user) => user.id === profileId,
  );

  if (!existing) {
    return { success: false, error: "invalid" };
  }

  const requestedRole = manageableUserRequestedRole(existing.role, role);

  if (requestedRole !== null && !isAssignableRole(requestedRole)) {
    return { success: false, error: "invalid" };
  }

  const roleChanged = manageableUserRoleChanges(existing.role, role);

  if (roleChanged && (await isRoleMutationBlockedBySupportMode())) {
    return { success: false, error: "support_mode" };
  }

  const { error: updateError } = await supabase.rpc("update_manageable_user", {
    p_profile_id: profileId,
    p_full_name: fullName,
    p_role: roleChanged ? requestedRole : null,
  });

  if (updateError) {
    return {
      success: false,
      error: classifyManageableUserUpdateError(updateError.message, roleChanged),
    };
  }

  revalidatePath("/admin/users");
  if (roleChanged) {
    revalidatePath("/", "layout");
  }

  const user = await loadManageableUser(supabase, profileId);

  if (!user) {
    return { success: false, error: roleChanged ? "assign" : "profile" };
  }

  if (profileId === actor.id && user.role !== existing.role) {
    // Self role change for non-owner admins is rare but possible.
  }

  return { success: true, user };
}

export async function transferOwnershipInline(
  newOwnerId: string,
): Promise<TransferOwnershipInlineResult> {
  const actor = await requireOwner();

  if (typeof newOwnerId !== "string" || newOwnerId.length === 0) {
    return { success: false, error: "invalid" };
  }

  if (newOwnerId === actor.id) {
    return { success: false, error: "invalid" };
  }

  if (await isRoleMutationBlockedBySupportMode()) {
    return { success: false, error: "support_mode" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("transfer_ownership", {
    p_new_owner_id: newOwnerId,
  });

  if (error) {
    return { success: false, error: classifyOwnershipTransferError(error.message) };
  }

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");

  return {
    success: true,
    previousOwnerId: actor.id,
    newOwnerId,
    viewerBecameAdmin: true,
  };
}

export async function assignUserRole(formData: FormData) {
  await requireManageRoles();

  const profileId = formData.get("profileId");
  const role = formData.get("role");

  if (typeof profileId !== "string" || typeof role !== "string" || !isAssignableRole(role)) {
    redirect("/admin/users?error=invalid");
  }

  if (await isRoleMutationBlockedBySupportMode()) {
    redirect("/admin/users?error=support-mode");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("assign_user_role", {
    p_profile_id: profileId,
    p_role: role,
  });

  if (error) {
    redirect(
      isSupportModeMutationErrorMessage(error.message)
        ? "/admin/users?error=support-mode"
        : "/admin/users?error=assign",
    );
  }

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  redirect("/admin/users?updated=1");
}

export type GetUserDeletionEligibilityResult =
  | { success: true; eligibility: UserDeletionEligibility }
  | { success: false; error: "invalid" | "unauthorized" };

export async function getUserDeletionEligibilityInline(
  profileId: string,
): Promise<GetUserDeletionEligibilityResult> {
  await requireManageRoles();

  if (typeof profileId !== "string" || profileId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();
  const eligibility = await fetchUserDeletionEligibility(supabase, profileId);

  if (!eligibility) {
    return { success: false, error: "invalid" };
  }

  return { success: true, eligibility };
}

export type PermanentlyDeleteUserInlineResult =
  | { success: "complete"; profileId: string }
  | { success: "partial"; profileId: string; message: string }
  | {
      success: false;
      error: "invalid" | "unauthorized" | "ineligible" | "auth" | "database" | "confirm_email";
      message: string;
    };

function isDeletionReasonCategory(value: string): value is UserDeletionReasonCategory {
  return value === "test_account" || value === "duplicate_error" || value === "other";
}

export async function permanentlyDeleteUserInline(input: {
  profileId: string;
  confirmEmail: string;
  accountEmail: string;
  reasonCategory: string;
  reasonNote?: string;
}): Promise<PermanentlyDeleteUserInlineResult> {
  await requireManageRoles();

  const { profileId, confirmEmail, accountEmail, reasonCategory, reasonNote } = input;

  if (typeof profileId !== "string" || profileId.length === 0) {
    return { success: false, error: "invalid", message: "User not found." };
  }

  if (!emailsMatchForDeletionConfirmation(confirmEmail, accountEmail)) {
    return {
      success: false,
      error: "confirm_email",
      message: "Type the user's email address exactly to confirm deletion.",
    };
  }

  if (!isDeletionReasonCategory(reasonCategory)) {
    return { success: false, error: "invalid", message: "Choose a valid deletion reason." };
  }

  const supabase = await createClient();

  const result = await permanentlyDeleteUserAccountOrchestrated({
    supabase,
    profileId,
    reasonCategory,
    reasonNote,
  });

  if (result.success === false) {
    return result;
  }

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");

  return result;
}

export async function transferOwnership(formData: FormData) {
  await requireOwner();

  const newOwnerId = formData.get("newOwnerId");

  if (typeof newOwnerId !== "string" || !newOwnerId) {
    redirect("/admin/users?error=invalid-transfer");
  }

  const result = await transferOwnershipInline(newOwnerId);

  if (!result.success) {
    redirect(
      result.error === "support_mode"
        ? "/admin/users?error=support-mode"
        : "/admin/users?error=transfer",
    );
  }

  redirect("/admin/users?transferred=1");
}
