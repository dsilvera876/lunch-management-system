"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageRoles, requireOwner } from "@/lib/auth";
import { isAssignableRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

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
  redirect("/admin/users?updated=1");
}

export async function transferOwnership(formData: FormData) {
  await requireOwner();

  const newOwnerId = formData.get("newOwnerId");

  if (typeof newOwnerId !== "string" || !newOwnerId) {
    redirect("/admin/users?error=invalid-transfer");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("transfer_ownership", {
    p_new_owner_id: newOwnerId,
  });

  if (error) {
    redirect("/admin/users?error=transfer");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?transferred=1");
}
