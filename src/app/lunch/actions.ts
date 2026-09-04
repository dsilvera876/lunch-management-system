"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function submitLunchOrder(formData: FormData) {
  await requireProfile();

  const lunchDayId = formData.get("lunchDayId");

  if (typeof lunchDayId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const items: Array<{
    menu_item_id: string;
    quantity: number;
  }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("quantity:") || typeof value !== "string") {
      continue;
    }

    const menuItemId = key.slice("quantity:".length);
    const quantity = Number(value);

    if (Number.isInteger(quantity) && quantity > 0) {
      items.push({
        menu_item_id: menuItemId,
        quantity,
      });
    }
  }

  if (items.length === 0) {
    redirect(`/lunch/${lunchDayId}?error=empty`);
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_order", {
    p_lunch_day_id: lunchDayId,
    p_items: items,
  });

  if (error) {
    redirect(
      `/lunch/${lunchDayId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/${lunchDayId}`);

  redirect(`/lunch/${lunchDayId}?ordered=1`);
}