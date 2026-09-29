"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getPasswordUpdateErrorPath,
  getPasswordUpdateRedirectPath,
} from "@/lib/auth-recovery";
import { validatePasswordUpdate } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const recoveryFlag = formData.get("recovery");
  const inviteFlag = formData.get("invite");
  const isRecovery = recoveryFlag === "1";
  const isInvite = inviteFlag === "1";

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    redirect(getPasswordUpdateErrorPath(isRecovery, "invalid", isInvite));
  }

  const validation = validatePasswordUpdate(password, confirmPassword);

  if (!validation.ok) {
    const errorCode = validation.code === "missing" ? "invalid" : validation.code;
    redirect(getPasswordUpdateErrorPath(isRecovery, errorCode, isInvite));
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(getPasswordUpdateErrorPath(isRecovery, "update", isInvite));
  }

  if (isInvite) {
    const { data: completion, error: completionError } = await supabase.rpc(
      "complete_signup_onboarding",
      { p_require_linked_request: true },
    );

    if (completionError) {
      console.error(
        "[account-setup] complete_signup_onboarding failed:",
        completionError.message,
      );
      redirect(getPasswordUpdateErrorPath(isRecovery, "setup", true));
    }

    const completionRow = completion as { ok?: boolean; code?: string } | null;
    if (
      completionRow?.ok === false ||
      (isInvite && completionRow?.code === "no_signup_request")
    ) {
      console.error("[account-setup] complete_signup_onboarding rejected:", completion);
      redirect(getPasswordUpdateErrorPath(isRecovery, "setup", true));
    }
  }

  if (isRecovery) {
    await supabase.auth.signOut({ scope: "local" });
  }

  revalidatePath("/", "layout");

  redirect(getPasswordUpdateRedirectPath(isRecovery, isInvite));
}
