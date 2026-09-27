"use server";

import { redirect } from "next/navigation";
import {
  parseClassifySignupEmailResult,
  parseRequestExternalSignupResult,
} from "@/lib/signup";
import { createClient } from "@/lib/supabase/server";

export type ClassifySignupActionResult =
  | { success: true; path: "company" | "external" }
  | { success: false; error: "invalid" };

export async function classifySignupEmail(input: {
  fullName: string;
  email: string;
}): Promise<ClassifySignupActionResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim();

  if (fullName.length === 0 || email.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classify_signup_email", {
    p_email: email,
  });

  if (error) {
    return { success: false, error: "invalid" };
  }

  const parsed = parseClassifySignupEmailResult(data);

  if (!parsed.ok) {
    return { success: false, error: "invalid" };
  }

  return { success: true, path: parsed.path };
}

export type RequestExternalSignupActionResult =
  | { success: true }
  | { success: false; error: "invalid" | "company" | "unavailable" };

export async function requestExternalSignup(input: {
  fullName: string;
  email: string;
}): Promise<RequestExternalSignupActionResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim();

  if (fullName.length === 0 || email.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_external_signup", {
    p_full_name: fullName,
    p_email: email,
  });

  if (error) {
    return { success: false, error: "invalid" };
  }

  const parsed = parseRequestExternalSignupResult(data);

  if (parsed.ok) {
    return { success: true };
  }

  if (parsed.code === "company_email") {
    return { success: false, error: "company" };
  }

  if (parsed.code === "unavailable") {
    return { success: false, error: "unavailable" };
  }

  return { success: false, error: "invalid" };
}

export async function completeCompanySignup(formData: FormData) {
  const supabase = await createClient();

  const fullName = formData.get("fullName");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof fullName !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    redirect("/signup?error=invalid");
  }

  if (password.length < 8) {
    redirect("/signup?error=password");
  }

  if (password !== confirmPassword) {
    redirect("/signup?error=password-mismatch");
  }

  const { data: classification, error: classifyError } = await supabase.rpc(
    "classify_signup_email",
    { p_email: email },
  );

  if (classifyError) {
    redirect("/signup?error=invalid");
  }

  const parsed = parseClassifySignupEmailResult(classification);

  if (!parsed.ok || parsed.path !== "company") {
    redirect("/signup?error=invalid");
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
      },
    },
  });

  if (error) {
    redirect("/signup?error=signup");
  }

  if (!data.session) {
    redirect("/signup?message=check-email");
  }

  redirect("/login");
}
