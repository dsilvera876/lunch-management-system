"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageCutoff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateOrderCutoff(formData: FormData) {
  await requireManageCutoff();

  const cutoffTime = formData.get("orderCutoffTime");
  const returnTo = formData.get("returnTo");

  const redirectPath =
    typeof returnTo === "string" && returnTo.startsWith("/admin")
      ? returnTo
      : "/admin";

  if (typeof cutoffTime !== "string" || !/^\d{2}:\d{2}$/.test(cutoffTime)) {
    redirect(`${redirectPath}?error=invalid-cutoff`);
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("app_settings")
    .update({ order_cutoff_time: `${cutoffTime}:00` })
    .eq("id", 1);

  if (error) {
    redirect(`${redirectPath}?error=cutoff-update`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/providers");
  revalidatePath("/lunch");
  revalidatePath("/home");

  redirect(`${redirectPath}?cutoff-updated=1`);
}
