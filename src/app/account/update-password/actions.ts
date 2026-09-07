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
  const isRecovery = recoveryFlag === "1";

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    redirect(getPasswordUpdateErrorPath(isRecovery, "invalid"));
  }

  const validation = validatePasswordUpdate(password, confirmPassword);

  if (!validation.ok) {
    const errorCode = validation.code === "missing" ? "invalid" : validation.code;
    redirect(getPasswordUpdateErrorPath(isRecovery, errorCode));
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
    redirect(getPasswordUpdateErrorPath(isRecovery, "update"));
  }

  if (isRecovery) {
    await supabase.auth.signOut({ scope: "local" });
  }

  revalidatePath("/", "layout");

  redirect(getPasswordUpdateRedirectPath(isRecovery));
}
