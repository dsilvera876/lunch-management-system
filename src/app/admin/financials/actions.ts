"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinalizeLunchPeriods } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function finalizeLunchPeriod(formData: FormData) {
  await requireFinalizeLunchPeriods();

  const periodId = formData.get("periodId");
  const returnTo = formData.get("returnTo");

  if (typeof periodId !== "string" || !periodId) {
    redirect("/admin/financials?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_lunch_period", {
    p_period_id: periodId,
  });

  if (error) {
    redirect("/admin/financials?error=finalize");
  }

  revalidatePath("/admin/financials");
  revalidatePath("/admin/lunch-periods");
  revalidatePath("/financials");
  revalidatePath("/home");

  if (typeof returnTo === "string" && returnTo.startsWith("/admin/financials")) {
    redirect(`${returnTo}?finalized=1`);
  }

  redirect(`/admin/financials?periodId=${periodId}&finalized=1`);
}
