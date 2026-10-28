"use server";

import { revalidatePath } from "next/cache";
import { requireManageLunchPeriods } from "@/lib/auth";
import type { LunchPeriodActionResult } from "@/lib/lunch-period-action-feedback";
import {
  validateFirstLunchPeriodInput,
  validateNextLunchPeriodInput,
} from "@/lib/lunch-periods";
import { createClient } from "@/lib/supabase/server";

export async function createFirstLunchPeriod(
  formData: FormData,
): Promise<LunchPeriodActionResult> {
  await requireManageLunchPeriods();

  const label = formData.get("label");
  const startDate = formData.get("startDate");
  const endDate = formData.get("endDate");

  if (
    typeof label !== "string" ||
    typeof startDate !== "string" ||
    typeof endDate !== "string"
  ) {
    return { success: false, error: "invalid" };
  }

  const validationError = validateFirstLunchPeriodInput({
    label,
    startDate,
    endDate,
  });

  if (validationError) {
    return { success: false, error: "invalid-range" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_first_lunch_period", {
    p_label: label.trim(),
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    return { success: false, error: "create" };
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  return { success: true };
}

export async function createNextLunchPeriod(
  formData: FormData,
): Promise<LunchPeriodActionResult> {
  await requireManageLunchPeriods();

  const label = formData.get("label");
  const endDate = formData.get("endDate");
  const derivedStartDate = formData.get("derivedStartDate");

  if (
    typeof label !== "string" ||
    typeof endDate !== "string" ||
    typeof derivedStartDate !== "string"
  ) {
    return { success: false, error: "invalid" };
  }

  const validationError = validateNextLunchPeriodInput({
    label,
    endDate,
    derivedStartDate,
  });

  if (validationError) {
    return { success: false, error: "invalid-range" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_next_lunch_period", {
    p_label: label.trim(),
    p_end_date: endDate,
  });

  if (error) {
    return { success: false, error: "create" };
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  return { success: true };
}

export async function updateLunchPeriodDetails(
  formData: FormData,
): Promise<LunchPeriodActionResult> {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");
  const label = formData.get("label");
  const endDate = formData.get("endDate");
  if (
    typeof periodId !== "string" || !periodId ||
    typeof label !== "string" || !label.trim() ||
    typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_lunch_period_details", {
    p_period_id: periodId,
    p_label: label.trim(),
    p_end_date: endDate,
  });
  if (error) {
    return { success: false, error: "update" };
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  return { success: true };
}

export async function updateLunchPeriodLabel(
  formData: FormData,
): Promise<LunchPeriodActionResult> {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");
  const label = formData.get("label");

  if (typeof periodId !== "string" || !periodId || typeof label !== "string" || !label.trim()) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_lunch_period_label", {
    p_period_id: periodId,
    p_label: label.trim(),
  });

  if (error) {
    return { success: false, error: "update" };
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  return { success: true };
}

export async function updateLatestLunchPeriodEndDate(
  formData: FormData,
): Promise<LunchPeriodActionResult> {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");
  const endDate = formData.get("endDate");

  if (typeof periodId !== "string" || !periodId || typeof endDate !== "string") {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_latest_lunch_period_end_date", {
    p_period_id: periodId,
    p_end_date: endDate,
  });

  if (error) {
    return { success: false, error: "update-end" };
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  return { success: true };
}

export async function setCurrentLunchPeriod(
  formData: FormData,
): Promise<LunchPeriodActionResult> {
  await requireManageLunchPeriods();

  const periodId = formData.get("periodId");

  if (typeof periodId !== "string" || !periodId) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_current_lunch_period", {
    p_period_id: periodId,
  });

  if (error) {
    return { success: false, error: "set-current" };
  }

  revalidatePath("/admin/lunch-periods");
  revalidatePath("/home");
  revalidatePath("/account");
  return { success: true };
}
