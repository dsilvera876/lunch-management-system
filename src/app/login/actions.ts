"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPostLoginPath } from "@/lib/navigation";
import { gateApplicationProfileAfterAuth } from "@/lib/post-login-gate";
import { createClient } from "@/lib/supabase/server";

async function redirectAfterAuth() {
  const supabase = await createClient();

  revalidatePath("/", "layout");

  const gate = await gateApplicationProfileAfterAuth(supabase);

  if (!gate.allowed) {
    redirect(gate.redirectTo);
  }

  redirect(getPostLoginPath(gate.role));
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    redirect("/login?error=invalid");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect("/login?error=unconfirmed");
    }

    redirect("/login?error=credentials");
  }

  await redirectAfterAuth();
}

