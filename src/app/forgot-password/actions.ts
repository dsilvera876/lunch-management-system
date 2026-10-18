"use server";

import {
  getPasswordResetRedirectTo,
  getPasswordResetRequestErrorPath,
  getPasswordResetRequestSuccessPath,
  isValidEmail,
} from "@/lib/auth-recovery";
import { getApplicationOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function requestPasswordReset(formData: FormData) {
  const emailRaw = formData.get("email");

  if (typeof emailRaw !== "string" || !isValidEmail(emailRaw)) {
    redirect(getPasswordResetRequestErrorPath("invalid-email"));
  }

  const email = emailRaw.trim().toLowerCase();
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetRedirectTo(getApplicationOrigin()),
  });

  if (error) {
    // Keep the browser response neutral. Hook/Auth failures may otherwise reveal
    // whether a syntactically valid address has an account.
    console.warn("[password-recovery] Auth did not accept a reset request.");
  }

  redirect(getPasswordResetRequestSuccessPath());
}
