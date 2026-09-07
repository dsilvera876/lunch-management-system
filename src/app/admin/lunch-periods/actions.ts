"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageLunchPeriods } from "@/lib/auth";
import {
  validateFirstLunchPeriodInput,
  validateNextLunchPeriodInput,
} from "@/lib/lunch-periods";
import { createClient } from "@/lib/supabase/server";

export async function createFirstLunchPeriod(formData: FormData) {
  await requireManageLunchPeriods();

  const label = formData.get("label");
  const startDate = formData.get("startDate");
  const endDate = formData.get("endDate");

  if (
    typeof label !== "string" ||
    typeof startDate !== "string" ||
    typeof endDate !== "string"
  ) {
    redirect("/admin/lunch-periods?error=invalid");
  }

  const validationError = validateFirstLunchPeriodInput({
    label,
    startDate,
    endDate,
  });

  if (validationError) {
    redirect("/admin/lunch-periods?error=invalid-range");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_first_lunch_period", {
    p_label: label.trim(),
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    redirect("/admin/lunch-periods?error=create");
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  redirect("/admin/lunch-periods?created=1");
}

export async function createNextLunchPeriod(formData: FormData) {
  await requireManageLunchPeriods();

  const label = formData.get("label");
  const endDate = formData.get("endDate");
  const derivedStartDate = formData.get("derivedStartDate");

  if (
    typeof label !== "string" ||
    typeof endDate !== "string" ||
    typeof derivedStartDate !== "string"
  ) {
    redirect("/admin/lunch-periods?error=invalid");
  }

  const validationError = validateNextLunchPeriodInput({
    label,
    endDate,
    derivedStartDate,
  });

  if (validationError) {
    redirect("/admin/lunch-periods?error=invalid-range");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_next_lunch_period", {
    p_label: label.trim(),
    p_end_date: endDate,
  });

  if (error) {
    redirect("/admin/lunch-periods?error=create");
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  redirect("/admin/lunch-periods?created=1");
}

export async function updateLunchPeriodLabel(formData: FormData) {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");
  const label = formData.get("label");

  if (typeof periodId !== "string" || !periodId || typeof label !== "string" || !label.trim()) {
    redirect("/admin/lunch-periods?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_lunch_period_label", {
    p_period_id: periodId,
    p_label: label.trim(),
  });

  if (error) {
    redirect("/admin/lunch-periods?error=update");
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  redirect("/admin/lunch-periods?updated=1");
}

export async function updateLatestLunchPeriodEndDate(formData: FormData) {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");
  const endDate = formData.get("endDate");

  if (typeof periodId !== "string" || !periodId || typeof endDate !== "string") {
    redirect("/admin/lunch-periods?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_latest_lunch_period_end_date", {
    p_period_id: periodId,
    p_end_date: endDate,
  });

  if (error) {
    redirect("/admin/lunch-periods?error=update-end");
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  redirect("/admin/lunch-periods?updated=1");
}

export async function setCurrentLunchPeriod(formData: FormData) {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");

  if (typeof periodId !== "string" || !periodId) {
    redirect("/admin/lunch-periods?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_current_lunch_period", {
    p_period_id: periodId,
  });

  if (error) {
    redirect("/admin/lunch-periods?error=set-current");
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  redirect("/admin/lunch-periods?current=1");
}
