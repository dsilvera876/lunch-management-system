"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireFinalizeLunchPeriods,
  requireMutateAccountsOperationalData,
  requireUpdateDailyLunchSubsidy,
} from "@/lib/auth";
import { appendSearchParams } from "@/lib/redirect-url";
import { createClient } from "@/lib/supabase/server";

function financialsRedirectBase(
  returnTo: FormDataEntryValue | null,
  periodId?: string,
): string {
  if (typeof returnTo === "string" && returnTo.startsWith("/admin/financials")) {
    return returnTo;
  }

  if (periodId) {
    return appendSearchParams("/admin/financials", { periodId });
  }

  return "/admin/financials";
}

export async function finalizeLunchPeriod(formData: FormData) {
  await requireFinalizeLunchPeriods();

  const periodId = formData.get("periodId");
  const returnTo = formData.get("returnTo");

  if (typeof periodId !== "string" || !periodId) {
    redirect(appendSearchParams("/admin/financials", { error: "invalid" }));
  }

  const redirectBase = financialsRedirectBase(returnTo, periodId);

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_lunch_period", {
    p_period_id: periodId,
  });

  if (error) {
    redirect(appendSearchParams(redirectBase, { error: "finalize" }));
  }

  revalidatePath("/admin/financials");
  revalidatePath("/admin/lunch-periods");
  revalidatePath("/financials");
  revalidatePath("/home");

  redirect(
    appendSearchParams(redirectBase, {
      finalized: "1",
      promptStaffNotice: "1",
    }),
  );
}

export async function sendStaffLunchPeriodFinalizedNoticeAction(periodId: string) {
  await requireMutateAccountsOperationalData();

  if (!periodId) {
    redirect(appendSearchParams("/admin/financials", { noticeError: "invalid" }));
  }

  const redirectBase = appendSearchParams("/admin/financials", { periodId });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_staff_lunch_period_finalized_notice", {
    p_lunch_period_id: periodId,
  });

  if (error) {
    redirect(appendSearchParams(redirectBase, { noticeError: "send" }));
  }

  const result = data as { ok?: boolean; code?: string } | null;
  if (!result?.ok) {
    const code = result?.code ?? "unknown";
    redirect(appendSearchParams(redirectBase, { noticeError: code }));
  }

  revalidatePath("/admin/financials");
  redirect(appendSearchParams(redirectBase, { noticeQueued: "1" }));
}

export async function updateDailyLunchSubsidy(formData: FormData) {
  await requireUpdateDailyLunchSubsidy();

  const amountRaw = formData.get("dailyLunchSubsidy");
  const returnTo = formData.get("returnTo");

  const redirectBase =
    typeof returnTo === "string" && returnTo.startsWith("/admin")
      ? returnTo
      : "/admin/financials";

  const amount = typeof amountRaw === "string" ? Number(amountRaw) : NaN;

  if (!Number.isFinite(amount) || amount < 0) {
    redirect(appendSearchParams(redirectBase, { "subsidy-error": "invalid" }));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_daily_lunch_subsidy", {
    p_amount: amount,
  });

  if (error) {
    redirect(appendSearchParams(redirectBase, { "subsidy-error": "update" }));
  }

  revalidatePath("/admin/financials");
  revalidatePath("/admin/lunch-periods");
  revalidatePath("/financials");
  revalidatePath("/home");

  redirect(appendSearchParams(redirectBase, { "subsidy-updated": "1" }));
}
