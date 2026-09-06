"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type OrderItemInput = {
  menu_item_id: string;
  quantity: number;
};

type ProviderOrderItemInput = {
  provider_menu_item_id: string;
  quantity: number;
};

function getItems(formData: FormData): OrderItemInput[] {
  const items: OrderItemInput[] = [];

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

  return items;
}

function getProviderItems(formData: FormData): ProviderOrderItemInput[] {
  const items: ProviderOrderItemInput[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("provider-quantity:") || typeof value !== "string") {
      continue;
    }

    const providerMenuItemId = key.slice("provider-quantity:".length);
    const quantity = Number(value);

    if (Number.isInteger(quantity) && quantity > 0) {
      items.push({
        provider_menu_item_id: providerMenuItemId,
        quantity,
      });
    }
  }

  return items;
}

function getOrderErrorCode(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("deadline")) {
    return "deadline";
  }

  if (
    normalized.includes("ordering is not open") ||
    normalized.includes("not available on weekends")
  ) {
    return "closed";
  }

  if (
    normalized.includes("menu item is invalid") ||
    normalized.includes("inactive") ||
    normalized.includes("not available")
  ) {
    return "unavailable-item";
  }

  if (normalized.includes("only submitted orders")) {
    return "locked";
  }

  if (
    normalized.includes("not authorized") ||
    normalized.includes("authentication required")
  ) {
    return "unauthorized";
  }

  return "generic";
}

export async function submitProviderOrder(formData: FormData) {
  await requireProfile();

  const providerId = formData.get("providerId");
  const orderDate = formData.get("orderDate");

  if (typeof providerId !== "string" || typeof orderDate !== "string") {
    redirect("/lunch?error=invalid");
  }

  const items = getProviderItems(formData);

  if (items.length === 0) {
    redirect(`/lunch/providers/${providerId}?error=empty`);
  }

  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("submit_provider_order", {
    p_provider_id: providerId,
    p_order_date: orderDate,
    p_items: items,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/providers/${providerId}?error=${errorCode}`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/providers/${providerId}`);
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?ordered=1`);
}

export async function submitLunchOrder(formData: FormData) {
  await requireProfile();

  const lunchDayId = formData.get("lunchDayId");

  if (typeof lunchDayId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const items = getItems(formData);

  if (items.length === 0) {
    redirect(`/lunch/${lunchDayId}?error=empty`);
  }

  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("submit_order", {
    p_lunch_day_id: lunchDayId,
    p_items: items,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/${lunchDayId}?error=${errorCode}`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/${lunchDayId}`);
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?ordered=1`);
}

export async function updateLunchOrder(formData: FormData) {
  await requireProfile();

  const orderId = formData.get("orderId");

  if (typeof orderId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const items = getItems(formData);

  if (items.length === 0) {
    redirect(`/lunch/orders/${orderId}?error=empty&edit=1`);
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("replace_order_items", {
    p_order_id: orderId,
    p_items: items,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/orders/${orderId}?error=${errorCode}&edit=1`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?updated=1`);
}

export async function cancelLunchOrder(formData: FormData) {
  await requireProfile();

  const orderId = formData.get("orderId");

  if (typeof orderId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/orders/${orderId}?error=${errorCode}`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?cancelled=1`);
}
