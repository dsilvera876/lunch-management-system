"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageRoles, requireOwner } from "@/lib/auth";
import { isAssignableRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { ManageableUserRecord } from "@/lib/user-management-presentation";

export type UpdateManageableUserInlineResult =
  | { success: true; user: ManageableUserRecord }
  | { success: false; error: "invalid" | "assign" | "profile" };

export type TransferOwnershipInlineResult =
  | {
      success: true;
      previousOwnerId: string;
      newOwnerId: string;
      viewerBecameAdmin: boolean;
    }
  | { success: false; error: "invalid" | "transfer" | "unauthorized" };

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

  if (existing.role === "owner") {
    const { error: profileError } = await supabase.rpc(
      "update_manageable_user_profile",
      {
        p_profile_id: profileId,
        p_full_name: fullName,
      },
    );

    if (profileError) {
      return { success: false, error: "profile" };
    }

    revalidatePath("/admin/users");
    const user = await loadManageableUser(supabase, profileId);
    return user
      ? { success: true, user }
      : { success: false, error: "profile" };
  }

  if (!isAssignableRole(role)) {
    return { success: false, error: "invalid" };
  }

  const { error: profileError } = await supabase.rpc(
    "update_manageable_user_profile",
    {
      p_profile_id: profileId,
      p_full_name: fullName,
    },
  );

  if (profileError) {
    return { success: false, error: "profile" };
  }

  if (existing.role !== role) {
    const { error: roleError } = await supabase.rpc("assign_user_role", {
      p_profile_id: profileId,
      p_role: role,
    });

    if (roleError) {
      return { success: false, error: "assign" };
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");

  const user = await loadManageableUser(supabase, profileId);

  if (!user) {
    return { success: false, error: "assign" };
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

  const supabase = await createClient();

  const { error } = await supabase.rpc("transfer_ownership", {
    p_new_owner_id: newOwnerId,
  });

  if (error) {
    if (error.message.includes("Only the current Owner")) {
      return { success: false, error: "unauthorized" };
    }

    return { success: false, error: "transfer" };
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

  const supabase = await createClient();

  const { error } = await supabase.rpc("assign_user_role", {
    p_profile_id: profileId,
    p_role: role,
  });

  if (error) {
    redirect("/admin/users?error=assign");
  }

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  redirect("/admin/users?updated=1");
}

export async function transferOwnership(formData: FormData) {
  await requireOwner();

  const newOwnerId = formData.get("newOwnerId");

  if (typeof newOwnerId !== "string" || !newOwnerId) {
    redirect("/admin/users?error=invalid-transfer");
  }

  const result = await transferOwnershipInline(newOwnerId);

  if (!result.success) {
    redirect("/admin/users?error=transfer");
  }

  redirect("/admin/users?transferred=1");
}
