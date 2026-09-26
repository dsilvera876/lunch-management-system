"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageCutoff } from "@/lib/auth";
import { appendSearchParams } from "@/lib/redirect-url";
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
    redirect(
      appendSearchParams(redirectPath, {
        error: "invalid-cutoff",
        ...(typeof cutoffTime === "string" && /^\d{1,2}:\d{2}$/.test(cutoffTime)
          ? { cutoffDraft: cutoffTime }
          : {}),
      }),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("app_settings")
    .update({ order_cutoff_time: `${cutoffTime}:00` })
    .eq("id", 1);

  if (error) {
    redirect(
      appendSearchParams(redirectPath, {
        error: "cutoff-update",
        cutoffDraft: cutoffTime,
      }),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/providers");
  revalidatePath("/lunch");
  revalidatePath("/home");

  redirect(appendSearchParams(redirectPath, { "cutoff-updated": "1" }));
}
