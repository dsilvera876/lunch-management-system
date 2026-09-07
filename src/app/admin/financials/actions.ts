"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinalizeLunchPeriods, requireUpdateDailyLunchSubsidy } from "@/lib/auth";
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

export async function updateDailyLunchSubsidy(formData: FormData) {
  await requireUpdateDailyLunchSubsidy();

  const amountRaw = formData.get("dailyLunchSubsidy");
  const returnTo = formData.get("returnTo");

  const redirectPath =
    typeof returnTo === "string" && returnTo.startsWith("/admin")
      ? returnTo
      : "/admin/financials";

  const amount = typeof amountRaw === "string" ? Number(amountRaw) : NaN;

  if (!Number.isFinite(amount) || amount < 0) {
    redirect(`${redirectPath}?subsidy-error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_daily_lunch_subsidy", {
    p_amount: amount,
  });

  if (error) {
    redirect(`${redirectPath}?subsidy-error=update`);
  }

  revalidatePath("/admin/financials");
  revalidatePath("/financials");
  revalidatePath("/home");

  redirect(`${redirectPath}?subsidy-updated=1`);
}
