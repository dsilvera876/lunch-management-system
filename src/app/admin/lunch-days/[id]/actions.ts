"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateLunchDay(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  const lunchDate = formData.get("lunchDate");
  const deadline = formData.get("deadline");
  const notes = formData.get("notes");

  if (
    typeof id !== "string" ||
    typeof lunchDate !== "string" ||
    typeof deadline !== "string" ||
    typeof notes !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(lunchDate) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)
  ) {
    redirect("/admin/lunch-days?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("lunch_days")
    .update({
      lunch_date: lunchDate,
      order_deadline: `${deadline}:00-05:00`,
      notes: notes.trim() || null,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/lunch-days/${id}?error=update`);
  }

  revalidatePath("/admin/lunch-days");
  revalidatePath(`/admin/lunch-days/${id}`);

  redirect(`/admin/lunch-days/${id}?updated=1`);
}

export async function updateLunchDayStatus(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  const status = formData.get("status");

  if (
    typeof id !== "string" ||
    typeof status !== "string" ||
    !["draft", "open", "closed", "completed"].includes(status)
  ) {
    redirect("/admin/lunch-days?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("lunch_days")
    .update({ status })
    .eq("id", id);

  if (error) {
    redirect(`/admin/lunch-days/${id}?error=status`);
  }

  revalidatePath("/admin/lunch-days");
  revalidatePath(`/admin/lunch-days/${id}`);

  redirect(`/admin/lunch-days/${id}`);
}

export async function createMenuItem(formData: FormData) {
  await requireAdmin();

  const lunchDayId = formData.get("lunchDayId");
  const name = formData.get("name");
  const description = formData.get("description");
  const price = formData.get("price");

  if (
    typeof lunchDayId !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof price !== "string"
  ) {
    redirect("/admin/lunch-days?error=invalid");
  }

  const parsedPrice = Number(price);

  if (
    name.trim().length === 0 ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 0
  ) {
    redirect(`/admin/lunch-days/${lunchDayId}?error=menu`);
  }

  const supabase = await createClient();

  const { error } = await supabase.from("menu_items").insert({
    lunch_day_id: lunchDayId,
    name: name.trim(),
    description: description.trim() || null,
    price: parsedPrice,
    is_active: true,
  });

  if (error) {
    redirect(`/admin/lunch-days/${lunchDayId}?error=menu`);
  }

  revalidatePath(`/admin/lunch-days/${lunchDayId}`);

  redirect(`/admin/lunch-days/${lunchDayId}?menuCreated=1`);
}

export async function toggleMenuItem(formData: FormData) {
  await requireAdmin();

  const lunchDayId = formData.get("lunchDayId");
  const menuItemId = formData.get("menuItemId");
  const isActive = formData.get("isActive");

  if (
    typeof lunchDayId !== "string" ||
    typeof menuItemId !== "string" ||
    typeof isActive !== "string"
  ) {
    redirect("/admin/lunch-days?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("menu_items")
    .update({
      is_active: isActive !== "true",
    })
    .eq("id", menuItemId)
    .eq("lunch_day_id", lunchDayId);

  if (error) {
    redirect(`/admin/lunch-days/${lunchDayId}?error=menu`);
  }

  revalidatePath(`/admin/lunch-days/${lunchDayId}`);
}