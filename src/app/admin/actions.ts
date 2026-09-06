"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateOrderCutoff(formData: FormData) {
  await requireAdmin();

  const cutoffTime = formData.get("orderCutoffTime");

  if (typeof cutoffTime !== "string" || !/^\d{2}:\d{2}$/.test(cutoffTime)) {
    redirect("/admin?error=invalid-cutoff");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("app_settings")
    .update({ order_cutoff_time: `${cutoffTime}:00` })
    .eq("id", 1);

  if (error) {
    redirect("/admin?error=cutoff-update");
  }

  revalidatePath("/admin");
  revalidatePath("/lunch");

  redirect("/admin?cutoff-updated=1");
}
