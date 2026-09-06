"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function parseWeekdays(formData: FormData): number[] {
  if (formData.get("allWeekdays") === "true") {
    return [1, 2, 3, 4, 5];
  }

  const weekdays: number[] = [];

  for (let day = 1; day <= 5; day += 1) {
    if (formData.get(`weekday:${day}`) === "on") {
      weekdays.push(day);
    }
  }

  return weekdays;
}

async function syncMenuItemWeekdays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  menuItemId: string,
  weekdays: number[],
) {
  const { error: deleteError } = await supabase
    .from("provider_menu_item_weekdays")
    .delete()
    .eq("provider_menu_item_id", menuItemId);

  if (deleteError) {
    return deleteError;
  }

  if (weekdays.length === 0) {
    return null;
  }

  const { error: insertError } = await supabase
    .from("provider_menu_item_weekdays")
    .insert(
      weekdays.map((weekday) => ({
        provider_menu_item_id: menuItemId,
        weekday,
      })),
    );

  return insertError;
}

export async function createProviderMenuItem(formData: FormData) {
  await requireAdmin();

  const providerId = formData.get("providerId");
  const name = formData.get("name");
  const description = formData.get("description");
  const price = formData.get("price");
  const weekdays = parseWeekdays(formData);

  if (
    typeof providerId !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof price !== "string" ||
    name.trim().length === 0 ||
    weekdays.length === 0
  ) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const parsedPrice = Number(price);

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const supabase = await createClient();

  const { data: menuItem, error } = await supabase
    .from("provider_menu_items")
    .insert({
      provider_id: providerId,
      name: name.trim(),
      description: description.trim() || null,
      price: parsedPrice,
      active: true,
    })
    .select("id")
    .single();

  if (error || !menuItem) {
    if (error?.code === "23505") {
      redirect(`/admin/providers/${providerId}?error=duplicate`);
    }

    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const weekdayError = await syncMenuItemWeekdays(
    supabase,
    menuItem.id,
    weekdays,
  );

  if (weekdayError) {
    await supabase.from("provider_menu_items").delete().eq("id", menuItem.id);
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  revalidatePath(`/admin/providers/${providerId}`);
  redirect(`/admin/providers/${providerId}?menuCreated=1`);
}

export async function updateProviderMenuItem(formData: FormData) {
  await requireAdmin();

  const providerId = formData.get("providerId");
  const menuItemId = formData.get("menuItemId");
  const name = formData.get("name");
  const description = formData.get("description");
  const price = formData.get("price");
  const weekdays = parseWeekdays(formData);

  if (
    typeof providerId !== "string" ||
    typeof menuItemId !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof price !== "string" ||
    name.trim().length === 0 ||
    weekdays.length === 0
  ) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const parsedPrice = Number(price);

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("provider_menu_items")
    .update({
      name: name.trim(),
      description: description.trim() || null,
      price: parsedPrice,
    })
    .eq("id", menuItemId)
    .eq("provider_id", providerId);

  if (error) {
    if (error.code === "23505") {
      redirect(`/admin/providers/${providerId}?error=duplicate`);
    }

    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const weekdayError = await syncMenuItemWeekdays(
    supabase,
    menuItemId,
    weekdays,
  );

  if (weekdayError) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  revalidatePath(`/admin/providers/${providerId}`);
  redirect(`/admin/providers/${providerId}?menuUpdated=1`);
}

export async function toggleProviderMenuItemActive(formData: FormData) {
  await requireAdmin();

  const providerId = formData.get("providerId");
  const menuItemId = formData.get("menuItemId");
  const active = formData.get("active");

  if (
    typeof providerId !== "string" ||
    typeof menuItemId !== "string" ||
    typeof active !== "string"
  ) {
    redirect("/admin/providers?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("provider_menu_items")
    .update({ active: active !== "true" })
    .eq("id", menuItemId)
    .eq("provider_id", providerId);

  if (error) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  revalidatePath(`/admin/providers/${providerId}`);
}
