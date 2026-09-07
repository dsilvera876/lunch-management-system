"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLegacyLunchDays } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createLunchDay(formData: FormData) {
  await requireLegacyLunchDays();

  const lunchDate = formData.get("lunchDate");
  const deadline = formData.get("deadline");
  const notes = formData.get("notes");

  if (
    typeof lunchDate !== "string" ||
    typeof deadline !== "string" ||
    typeof notes !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(lunchDate) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)
  ) {
    redirect("/admin/lunch-days?error=invalid");
  }

  // datetime-local contains no timezone.
  // Lunch Management System operates in Jamaica (UTC-5).
  const orderDeadline = `${deadline}:00-05:00`;

  const supabase = await createClient();

  const { error } = await supabase.from("lunch_days").insert({
    lunch_date: lunchDate,
    order_deadline: orderDeadline,
    status: "draft",
    notes: notes.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      redirect("/admin/lunch-days?error=duplicate");
    }

    redirect("/admin/lunch-days?error=create");
  }

  revalidatePath("/admin/lunch-days");
  redirect("/admin/lunch-days?created=1");
}