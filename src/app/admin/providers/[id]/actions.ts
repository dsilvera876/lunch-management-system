"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_UNIT_LABEL,
  normalizeDisplayCategory,
  type MenuItemType,
} from "@/lib/menu-items";
import type { ManageMenuItemRecord } from "@/lib/lunch-providers-presentation";
import { isProviderMenuItemInUseDeletionError } from "@/lib/unused-record-deletion";

export type ProviderMenuItemMutationError =
  | "invalid"
  | "no-weekdays"
  | "duplicate"
  | "menu";

export type ProviderMenuItemDeleteError = "invalid" | "in-use" | "menu" | "unauthorized";

export type DeleteProviderMenuItemInlineResult =
  | { success: true }
  | { success: false; error: ProviderMenuItemDeleteError };

export type CreateProviderMenuItemInlineResult =
  | { success: true; item: ManageMenuItemRecord }
  | { success: false; error: ProviderMenuItemMutationError };

export type UpdateProviderMenuItemInlineResult =
  | { success: true; item: ManageMenuItemRecord }
  | { success: false; error: ProviderMenuItemMutationError };

export type ToggleProviderMenuItemInlineResult =
  | { success: true; item: ManageMenuItemRecord }
  | { success: false; error: ProviderMenuItemMutationError };

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  item_type: string;
  unit_label: string;
  display_category: string | null;
  active: boolean;
  provider_menu_item_weekdays: Array<{ weekday: number }>;
};

function mapMenuItemRow(row: MenuItemRow): ManageMenuItemRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    itemType: row.item_type as MenuItemType,
    unitLabel: row.unit_label,
    displayCategory: row.display_category,
    active: row.active,
    weekdays: row.provider_menu_item_weekdays.map((entry) => entry.weekday),
  };
}

const MENU_ITEM_SELECT = `
  id,
  name,
  description,
  price,
  item_type,
  unit_label,
  display_category,
  active,
  provider_menu_item_weekdays (
    weekday
  )
`;

type ParsedMenuItemInput =
  | {
      ok: true;
      providerId: string;
      name: string;
      description: string;
      parsedPrice: number;
      itemType: MenuItemType;
      unitLabel: string;
      displayCategory: string | null;
      weekdays: number[];
    }
  | { ok: false; error: ProviderMenuItemMutationError; providerId?: string };

function parseMenuItemFormData(formData: FormData): ParsedMenuItemInput {
  const providerId = formData.get("providerId");
  const name = formData.get("name");
  const description = formData.get("description");
  const price = formData.get("price");
  const itemType = parseItemType(formData.get("itemType"));
  const unitLabel = parseUnitLabel(formData.get("unitLabel")) ?? DEFAULT_UNIT_LABEL;
  const displayCategory =
    itemType === "standalone"
      ? parseDisplayCategory(formData.get("displayCategory"))
      : null;
  const weekdays = parseWeekdays(formData);

  if (
    typeof providerId !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof price !== "string" ||
    name.trim().length === 0 ||
    !itemType
  ) {
    return {
      ok: false,
      error: "invalid",
      providerId: typeof providerId === "string" ? providerId : undefined,
    };
  }

  if (weekdays.length === 0) {
    return { ok: false, error: "no-weekdays", providerId };
  }

  const parsedPrice = Number(price);

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return { ok: false, error: "invalid", providerId };
  }

  return {
    ok: true,
    providerId,
    name: name.trim(),
    description,
    parsedPrice,
    itemType,
    unitLabel,
    displayCategory,
    weekdays,
  };
}

function parseWeekdays(formData: FormData): number[] {
  const weekdays: number[] = [];

  for (let day = 1; day <= 5; day += 1) {
    if (formData.get(`weekday:${day}`) === "on") {
      weekdays.push(day);
    }
  }

  return weekdays;
}

function parseItemType(value: FormDataEntryValue | null): MenuItemType | null {
  if (value === "main" || value === "side" || value === "standalone") {
    return value;
  }

  return null;
}

function parseUnitLabel(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > 40) {
    return null;
  }

  return trimmed;
}

function parseDisplayCategory(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeDisplayCategory(value);
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

async function loadProviderMenuItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  menuItemId: string,
  providerId: string,
): Promise<ManageMenuItemRecord | null> {
  const { data, error } = await supabase
    .from("provider_menu_items")
    .select(MENU_ITEM_SELECT)
    .eq("id", menuItemId)
    .eq("provider_id", providerId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapMenuItemRow(data as MenuItemRow);
}

export async function createProviderMenuItemInline(
  formData: FormData,
): Promise<CreateProviderMenuItemInlineResult> {
  await requireHrAdminOrOwner();

  const parsed = parseMenuItemFormData(formData);

  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const supabase = await createClient();

  const { data: menuItem, error } = await supabase
    .from("provider_menu_items")
    .insert({
      provider_id: parsed.providerId,
      name: parsed.name,
      description: parsed.description.trim() || null,
      price: parsed.parsedPrice,
      item_type: parsed.itemType,
      unit_label: parsed.unitLabel,
      display_category: parsed.displayCategory,
      active: true,
    })
    .select("id")
    .single();

  if (error || !menuItem) {
    if (error?.code === "23505") {
      return { success: false, error: "duplicate" };
    }

    return { success: false, error: "menu" };
  }

  const weekdayError = await syncMenuItemWeekdays(
    supabase,
    menuItem.id,
    parsed.weekdays,
  );

  if (weekdayError) {
    await supabase.from("provider_menu_items").delete().eq("id", menuItem.id);
    return { success: false, error: "menu" };
  }

  const item = await loadProviderMenuItem(supabase, menuItem.id, parsed.providerId);

  if (!item) {
    return { success: false, error: "menu" };
  }

  revalidatePath(`/admin/providers/${parsed.providerId}`);
  return { success: true, item };
}

export async function createProviderMenuItem(formData: FormData) {
  await requireHrAdminOrOwner();

  const parsed = parseMenuItemFormData(formData);

  if (!parsed.ok) {
    const providerId = parsed.providerId ?? "invalid";
    if (parsed.error === "no-weekdays") {
      redirect(`/admin/providers/${providerId}?error=no-weekdays`);
    }

    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  const result = await createProviderMenuItemInline(formData);

  if (!result.success) {
    if (result.error === "duplicate") {
      redirect(`/admin/providers/${parsed.providerId}?error=duplicate`);
    }

    if (result.error === "no-weekdays") {
      redirect(`/admin/providers/${parsed.providerId}?error=no-weekdays`);
    }

    redirect(`/admin/providers/${parsed.providerId}?error=menu`);
  }

  redirect(`/admin/providers/${parsed.providerId}?menuCreated=1`);
}

export async function updateProviderMenuItemInline(
  formData: FormData,
): Promise<UpdateProviderMenuItemInlineResult> {
  await requireHrAdminOrOwner();

  const menuItemId = formData.get("menuItemId");

  if (typeof menuItemId !== "string" || menuItemId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const parsed = parseMenuItemFormData(formData);

  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("provider_menu_items")
    .update({
      name: parsed.name,
      description: parsed.description.trim() || null,
      price: parsed.parsedPrice,
      item_type: parsed.itemType,
      unit_label: parsed.unitLabel,
      display_category: parsed.displayCategory,
    })
    .eq("id", menuItemId)
    .eq("provider_id", parsed.providerId);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "duplicate" };
    }

    return { success: false, error: "menu" };
  }

  const weekdayError = await syncMenuItemWeekdays(
    supabase,
    menuItemId,
    parsed.weekdays,
  );

  if (weekdayError) {
    return { success: false, error: "menu" };
  }

  const item = await loadProviderMenuItem(supabase, menuItemId, parsed.providerId);

  if (!item) {
    return { success: false, error: "menu" };
  }

  revalidatePath(`/admin/providers/${parsed.providerId}`);
  return { success: true, item };
}

export async function updateProviderMenuItem(formData: FormData) {
  const providerId = formData.get("providerId");
  const result = await updateProviderMenuItemInline(formData);

  if (!result.success) {
    const id = typeof providerId === "string" ? providerId : "invalid";

    if (result.error === "duplicate") {
      redirect(`/admin/providers/${id}?error=duplicate`);
    }

    if (result.error === "no-weekdays") {
      redirect(`/admin/providers/${id}?error=no-weekdays`);
    }

    redirect(`/admin/providers/${id}?error=menu`);
  }

  const id = typeof providerId === "string" ? providerId : "invalid";
  redirect(`/admin/providers/${id}?menuUpdated=1`);
}

export async function toggleProviderMenuItemActiveInline(
  providerId: string,
  menuItemId: string,
  currentlyActive: boolean,
): Promise<ToggleProviderMenuItemInlineResult> {
  await requireHrAdminOrOwner();

  if (providerId.length === 0 || menuItemId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("provider_menu_items")
    .update({ active: !currentlyActive })
    .eq("id", menuItemId)
    .eq("provider_id", providerId);

  if (error) {
    return { success: false, error: "menu" };
  }

  const item = await loadProviderMenuItem(supabase, menuItemId, providerId);

  if (!item) {
    return { success: false, error: "menu" };
  }

  revalidatePath(`/admin/providers/${providerId}`);
  return { success: true, item };
}

export async function toggleProviderMenuItemActive(formData: FormData) {
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

  const result = await toggleProviderMenuItemActiveInline(
    providerId,
    menuItemId,
    active === "true",
  );

  if (!result.success) {
    redirect(`/admin/providers/${providerId}?error=menu`);
  }

  redirect(`/admin/providers/${providerId}?menuToggled=1`);
}

export async function deleteProviderMenuItemInline(
  providerId: string,
  menuItemId: string,
): Promise<DeleteProviderMenuItemInlineResult> {
  await requireHrAdminOrOwner();

  if (providerId.length === 0 || menuItemId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_unused_provider_menu_item", {
    p_provider_id: providerId,
    p_menu_item_id: menuItemId,
  });

  if (error) {
    if (isProviderMenuItemInUseDeletionError(error.message)) {
      return { success: false, error: "in-use" };
    }

    if (error.message.includes("Not authorized")) {
      return { success: false, error: "unauthorized" };
    }

    return { success: false, error: "menu" };
  }

  revalidatePath(`/admin/providers/${providerId}`);
  return { success: true };
}
